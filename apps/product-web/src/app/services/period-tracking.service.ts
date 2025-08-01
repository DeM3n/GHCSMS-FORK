import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  Observable,
  from,
  map,
  catchError,
  of,
  switchMap,
  BehaviorSubject,
} from 'rxjs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';
import { AuthService } from './auth.service';
import {
  PeriodEntry,
  PeriodStats,
  PeriodTrackingRequest,
  PeriodTrackingResponse,
  calculateCycleDay,
  calculateNextPeriodDate,
  calculateFertileWindow,
  calculateOvulationDate,
  calculateFertilityAnalysis,
  calculateConceptionTiming,
  calculatePeriodStatus,
} from '../models/period-tracking.model';

// Database function response interfaces
interface DatabaseFunctionResponse {
  message?: string;
  period_id?: string;
  predictions?: any;
  success?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class PeriodTrackingService {
  private supabase: SupabaseClient;
  private authService = inject(AuthService);
  private http = inject(HttpClient);

  // In-memory storage for period data
  private periodHistorySubject = new BehaviorSubject<PeriodEntry[]>([]);
  private periodStatsSubject = new BehaviorSubject<PeriodStats | null>(null);

  // Database function names
  private readonly DB_FUNCTIONS = {
    TRACK_PERIOD: 'track_period_and_fertility',
    GET_PERIOD_HISTORY: 'get_period_history',
    GET_PERIOD_STATS: 'get_period_stats',
    UPDATE_PERIOD: 'update_period_entry',
  };

  constructor() {
    console.log('Initializing PeriodTrackingService...');
    console.log('Supabase URL:', environment.supabaseUrl);
    console.log(
      'Supabase Key (first 20 chars):',
      (environment.supabaseAnonKey || environment.supabaseKey)?.substring(
        0,
        20
      ) + '...'
    );
    console.log('Using database functions:', this.DB_FUNCTIONS);

    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseAnonKey || environment.supabaseKey
    );

    console.log('Supabase client created successfully for period tracking');

    // Set up auth state listener to ensure we have proper session
    this.initializeSupabaseAuth();
  }

  private async initializeSupabaseAuth(): Promise<void> {
    try {
      // Try to get existing session
      const {
        data: { session },
        error,
      } = await this.supabase.auth.getSession();

      if (error) {
        console.warn('⚠️ Error getting Supabase session:', error);
      }

      if (session) {
        console.log('✅ Supabase session found:', session.user?.id);
      } else {
        console.log('ℹ️ No Supabase session found, will use anon access');
      }

      // Listen for auth changes
      this.supabase.auth.onAuthStateChange((event, session) => {
        console.log(
          '🔄 Supabase auth state changed:',
          event,
          session?.user?.id
        );
      });
    } catch (error) {
      console.error('❌ Error initializing Supabase auth:', error);
    }
  }

  // =========== IN-MEMORY STORAGE METHODS ===========
  private getCurrentUserId(): string {
    try {
      // First try to get user from localStorage directly
      const currentUserStr = localStorage.getItem('current_user');
      if (currentUserStr) {
        const currentUser = JSON.parse(currentUserStr);
        const userId =
          currentUser.supabase_user?.id ||
          currentUser.id ||
          currentUser.patient_id;

        console.log('🔍 Getting current user ID from localStorage:', {
          currentUser,
          userId,
          source: 'localStorage',
        });

        if (userId) {
          return userId;
        }
      }

      // Fallback: try auth service
      const authUser = this.authService.getCurrentUser();
      const authUserId = authUser?.patientId || authUser?.id;

      console.log('🔍 Getting current user ID from authService:', {
        authUser,
        authUserId,
        source: 'authService',
      });

      if (authUserId) {
        return authUserId;
      }

      // Final fallback: generate a session-based user ID
      let sessionUserId = sessionStorage.getItem('session_user_id');
      if (!sessionUserId) {
        sessionUserId = `user_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        sessionStorage.setItem('session_user_id', sessionUserId);
        console.log('🔍 Generated new session user ID:', sessionUserId);
      }

      console.log('🔍 Using session user ID:', sessionUserId);
      return sessionUserId;
    } catch (error) {
      console.error('❌ Error getting current user ID:', error);
      // Generate a fallback ID
      const fallbackId = `fallback_${Date.now()}`;
      console.log('🔍 Using fallback user ID:', fallbackId);
      return fallbackId;
    }
  }

  /**
   * Check if user has period data in memory
   */
  hasMemoryData(): boolean {
    const memoryData = this.periodHistorySubject.value;
    return memoryData !== null && memoryData.length > 0;
  }

  /**
   * Debug method to check what user data is available
   */
  private debugUserData(): void {
    console.log('🔍 Debugging user data sources:');

    // Check localStorage
    const currentUserStr = localStorage.getItem('current_user');
    console.log(
      '📱 localStorage current_user:',
      currentUserStr ? JSON.parse(currentUserStr) : null
    );

    // Check sessionStorage
    const sessionUserId = sessionStorage.getItem('session_user_id');
    console.log('📱 sessionStorage session_user_id:', sessionUserId);

    // Check auth service
    const authUser = this.authService.getCurrentUser();
    console.log('🔐 AuthService current user:', authUser);

    // Check access tokens
    const accessToken = localStorage.getItem('access_token');
    const sessionAccessToken = sessionStorage.getItem('access_token');
    console.log('🔑 Access tokens:', {
      localStorage: !!accessToken,
      sessionStorage: !!sessionAccessToken,
    });
  }

  private saveNewPeriodToMemory(
    request: PeriodTrackingRequest,
    periodId: string
  ): void {
    try {
      // Get existing period history from memory
      const existingHistory = this.periodHistorySubject.value || [];

      // Create new period entry
      const newPeriodEntry: PeriodEntry = {
        period_id: periodId,
        patient_id: this.getCurrentUserId(),
        start_date: request.start_date,
        cycle_length: request.cycle_length || null,
        period_length: request.period_length || null,
        estimated_next_date: null,
        flow_intensity: request.flow_intensity || 'medium',
        symptoms: request.symptoms || [],
        period_description: request.period_description || null,
        predictions: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Add new entry to the beginning of the array (most recent first)
      const updatedHistory = [newPeriodEntry, ...existingHistory];

      // Update the BehaviorSubject
      this.periodHistorySubject.next(updatedHistory);

      console.log('💾 New period entry saved to memory:', newPeriodEntry);
    } catch (error) {
      console.error('❌ Error saving new period to memory:', error);
    }
  }

  // =========== LOCAL STORAGE METHODS ===========
  private saveToLocalStorage(key: string, data: any): void {
    console.log('🔄 Starting saveToLocalStorage:', {
      key,
      dataLength: data?.length,
    });

    try {
      const jsonData = JSON.stringify(data);
      localStorage.setItem(key, jsonData);

      // Verify it was saved
      const savedData = localStorage.getItem(key);
      const isSuccessful = savedData !== null;

      console.log(`💾 Save to localStorage result:`, {
        key,
        dataLength: data?.length,
        jsonDataLength: jsonData.length,
        isSuccessful,
        savedDataExists: !!savedData,
      });

      if (isSuccessful) {
        console.log(`✅ Successfully saved to localStorage: ${key}`);
      } else {
        console.error(`❌ Failed to save to localStorage: ${key}`);
      }
    } catch (error) {
      console.error('❌ Error saving to localStorage:', error);
    }
  }

  private getFromLocalStorage<T>(key: string): T | null {
    try {
      const jsonData = localStorage.getItem(key);
      if (jsonData) {
        const data = JSON.parse(jsonData);
        console.log(`📖 Retrieved from localStorage: ${key}`, data);
        return data;
      }
      return null;
    } catch (error) {
      console.error('❌ Error reading from localStorage:', error);
      return null;
    }
  }

  private removeFromLocalStorage(key: string): void {
    try {
      localStorage.removeItem(key);
      console.log(`🗑️ Removed from localStorage: ${key}`);
    } catch (error) {
      console.error('❌ Error removing from localStorage:', error);
    }
  }

  private getUserSpecificKey(baseKey: string): string {
    const userId = this.getCurrentUserId();
    return `${baseKey}_${userId}`;
  }

  // Local Storage Keys
  private readonly LOCAL_STORAGE_KEYS = {
    PERIOD_HISTORY: 'period_history',
    PERIOD_STATS: 'period_stats',
    CURRENT_USER: 'current_user_period_data',
  };

  /**
   * Clear all period data from local storage for current user
   */
  clearLocalStorageData(): void {
    const userId = this.getCurrentUserId();
    const keys = [
      this.getUserSpecificKey(this.LOCAL_STORAGE_KEYS.PERIOD_HISTORY),
      this.getUserSpecificKey(this.LOCAL_STORAGE_KEYS.PERIOD_STATS),
      this.getUserSpecificKey(this.LOCAL_STORAGE_KEYS.CURRENT_USER),
    ];

    keys.forEach((key) => {
      this.removeFromLocalStorage(key);
    });

    console.log(
      '🗑️ All period data cleared from localStorage for user:',
      userId
    );
  }

  /**
   * Get period data from local storage only (without API call)
   */
  getPeriodHistoryFromLocalStorage(): PeriodEntry[] {
    const localData = this.getFromLocalStorage<PeriodEntry[]>(
      this.getUserSpecificKey(this.LOCAL_STORAGE_KEYS.PERIOD_HISTORY)
    );
    return localData || [];
  }

  /**
   * Save period data directly to local storage
   */
  savePeriodHistoryToLocalStorage(periodHistory: PeriodEntry[]): void {
    this.saveToLocalStorage(
      this.getUserSpecificKey(this.LOCAL_STORAGE_KEYS.PERIOD_HISTORY),
      periodHistory
    );
  }

  /**
   * Check if user has period data in local storage
   */
  hasLocalStorageData(): boolean {
    const localData = this.getFromLocalStorage<PeriodEntry[]>(
      this.getUserSpecificKey(this.LOCAL_STORAGE_KEYS.PERIOD_HISTORY)
    );
    return localData !== null && localData.length > 0;
  }

  /**
   * Public method to test user data retrieval (for debugging)
   */
  testUserDataRetrieval(): void {
    console.log('🧪 Testing user data retrieval...');
    this.debugUserData();
    const userId = this.getCurrentUserId();
    console.log('✅ Final user ID:', userId);

    // Test localStorage key generation
    const testKey = this.getUserSpecificKey('test');
    console.log('🔑 Generated storage key for "test":', testKey);
  }

  private saveNewPeriodToLocalStorage(
    request: PeriodTrackingRequest,
    periodId: string
  ): void {
    console.log('🔄 Starting saveNewPeriodToLocalStorage:', {
      request,
      periodId,
    });

    // Debug user data sources
    this.debugUserData();

    try {
      const currentUserId = this.getCurrentUserId();
      const storageKey = this.getUserSpecificKey(
        this.LOCAL_STORAGE_KEYS.PERIOD_HISTORY
      );

      console.log('🔍 Local storage details:', {
        currentUserId,
        storageKey,
        localStorageKeys: this.LOCAL_STORAGE_KEYS,
      });

      // Get existing period history from local storage
      const existingHistory =
        this.getFromLocalStorage<PeriodEntry[]>(storageKey) || [];

      console.log('📖 Existing history from localStorage:', existingHistory);

      // Create new period entry
      const newPeriodEntry: PeriodEntry = {
        period_id: periodId,
        patient_id: currentUserId,
        start_date: request.start_date,
        cycle_length: request.cycle_length || null,
        period_length: request.period_length || null,
        estimated_next_date: null,
        flow_intensity: request.flow_intensity || 'medium',
        symptoms: request.symptoms || [],
        period_description: request.period_description || null,
        predictions: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      console.log('📝 New period entry created:', newPeriodEntry);

      // Add new entry to the beginning of the array (most recent first)
      const updatedHistory = [newPeriodEntry, ...existingHistory];

      console.log('📊 Updated history array:', updatedHistory);

      // Save updated history to local storage
      this.saveToLocalStorage(storageKey, updatedHistory);

      console.log('✅ New period entry saved to localStorage successfully');
    } catch (error) {
      console.error('❌ Error saving new period to localStorage:', error);
    }
  }

  /**
   * Log new period data
   */
  logPeriodData(
    request: PeriodTrackingRequest
  ): Observable<PeriodTrackingResponse> {
    console.log('🚀 PERIOD SERVICE - Starting period data logging process...');
    console.log('📝 Request data:', request);

    return new Observable((observer) => {
      try {
        // Get user ID using our improved method
        const userId = this.getCurrentUserId();
        console.log('👤 Using user ID:', userId);

        // Prepare parameters for database function
        const functionParams = {
          p_patient_id: userId,
          p_start_date: request.start_date,
          p_cycle_length: request.cycle_length || null,
          p_period_length: request.period_length || null,
          p_symptoms: request.symptoms || [],
          p_flow_intensity: request.flow_intensity,
          p_period_description: request.period_description || null,
        };

        console.log('🔧 Calling database function:', {
          function: this.DB_FUNCTIONS.TRACK_PERIOD,
          params: functionParams,
        });

        // Call Supabase database function
        from(this.supabase.rpc(this.DB_FUNCTIONS.TRACK_PERIOD, functionParams))
          .pipe(
            map(({ data, error }) => {
              console.log('🔍 Raw RPC response:', { data, error });

              if (error) {
                console.error('❌ Database function error details:', {
                  message: error.message,
                  details: error.details,
                  hint: error.hint,
                  code: error.code,
                });

                // If it's an API key error, try to save locally only
                if (
                  error.message?.includes('No API key found') ||
                  error.message?.includes('apikey')
                ) {
                  console.log(
                    '🔄 API key error detected, saving to localStorage only...'
                  );
                  throw new Error('API_KEY_ERROR');
                }

                throw error;
              }

              console.log('✅ Database function response:', data);

              const response: PeriodTrackingResponse = {
                success: true,
                message: data?.message || 'Period data logged successfully',
                period_id: data?.period_id || `period_${Date.now()}`,
              };

              // Save the new period entry to memory and local storage
              this.saveNewPeriodToMemory(request, response.period_id!);
              this.saveNewPeriodToLocalStorage(request, response.period_id!);

              console.log(
                '✅ PERIOD SERVICE - Period logged successfully:',
                response
              );
              return response;
            }),
            catchError((error) => {
              console.error(
                '❌ PERIOD SERVICE - Network/connection error:',
                error
              );

              // If it's a network error or API key error, try to save locally only
              console.log('🔄 Error detected, saving to localStorage only...');
              this.saveToLocalStorageOnly(request, observer);
              return of(null); // Return null to complete the observable
            })
          )
          .subscribe({
            next: (response) => {
              if (response) {
                observer.next(response);
                observer.complete();
              }
            },
            error: (error) => {
              console.error('❌ Unexpected error in subscription:', error);
              this.saveToLocalStorageOnly(request, observer);
            },
          });
      } catch (error) {
        console.error('❌ PERIOD SERVICE - Unexpected error:', error);
        this.saveToLocalStorageOnly(request, observer);
      }
    });
  }

  /**
   * Fallback method to save data locally when database is unavailable
   */
  private saveToLocalStorageOnly(
    request: PeriodTrackingRequest,
    observer: any
  ): void {
    try {
      const fallbackPeriodId = `local_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      console.log(
        '💾 Saving to localStorage only with fallback ID:',
        fallbackPeriodId
      );

      // Save to memory and localStorage
      this.saveNewPeriodToMemory(request, fallbackPeriodId);
      this.saveNewPeriodToLocalStorage(request, fallbackPeriodId);

      const response: PeriodTrackingResponse = {
        success: true,
        message: 'Period data saved locally (offline mode)',
        period_id: fallbackPeriodId,
      };

      console.log('✅ PERIOD SERVICE - Period saved locally:', response);
      observer.next(response);
      observer.complete();
    } catch (localError) {
      console.error('❌ Failed to save locally:', localError);
      observer.error(localError);
    }
  }

  /**
   * Get period history data
   */
  getPeriodHistory(): Observable<PeriodEntry[]> {
    console.log('🔍 Getting period history...');

    // First return data from memory if available
    const memoryData = this.periodHistorySubject.value;
    if (memoryData && memoryData.length > 0) {
      console.log('📖 Returning period history from memory:', memoryData);
      return of(memoryData);
    }

    // Try to get from localStorage
    const localData = this.getPeriodHistoryFromLocalStorage();
    if (localData && localData.length > 0) {
      console.log('📖 Returning period history from localStorage:', localData);
      // Update memory with localStorage data
      this.periodHistorySubject.next(localData);
      return of(localData);
    }

    // If no local data, return empty array
    console.log('📖 No period history found, returning empty array');
    return of([]);
  }

  /**
   * Get period statistics
   */
  getPeriodStats(): Observable<PeriodStats | null> {
    console.log('📊 Getting period stats...');

    // First check memory
    const memoryStats = this.periodStatsSubject.value;
    if (memoryStats) {
      console.log('📊 Returning period stats from memory:', memoryStats);
      return of(memoryStats);
    }

    // Calculate stats from current period history
    const periodHistory = this.periodHistorySubject.value;
    if (periodHistory && periodHistory.length > 0) {
      const stats = this.calculatePeriodStats(periodHistory);
      this.periodStatsSubject.next(stats);
      console.log('📊 Calculated and returning period stats:', stats);
      return of(stats);
    }

    console.log('📊 No period data available for stats calculation');
    return of(null);
  }

  /**
   * Calculate period statistics from history data
   */
  private calculatePeriodStats(history: PeriodEntry[]): PeriodStats | null {
    if (!history || history.length === 0) {
      return null;
    }

    try {
      // Sort history by start date (most recent first)
      const sortedHistory = [...history].sort(
        (a, b) =>
          new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
      );

      const lastPeriodStart = new Date(sortedHistory[0].start_date);

      // Calculate cycle lengths
      const cycleLengths: number[] = [];
      for (let i = 0; i < sortedHistory.length - 1; i++) {
        const current = new Date(sortedHistory[i].start_date);
        const previous = new Date(sortedHistory[i + 1].start_date);
        const cycleLength = Math.round(
          (current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (cycleLength > 0 && cycleLength <= 45) {
          // Reasonable cycle length
          cycleLengths.push(cycleLength);
        }
      }

      const averageCycleLength =
        cycleLengths.length > 0
          ? Math.round(
              cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length
            )
          : 28;

      // Calculate period lengths using actual period_length or default 5 days
      const periodLengths = history
        .filter((entry) => entry.cycle_length) // Only completed periods have cycle_length
        .map((entry) => {
          // Use actual period_length or default 5 days
          return entry.period_length || 5;
        });

      const averagePeriodLength =
        periodLengths.length > 0
          ? Math.round(
              periodLengths.reduce((a, b) => a + b, 0) / periodLengths.length
            )
          : 5;

      // Convert date to string for calculations
      const lastPeriodStartString = lastPeriodStart.toISOString().split('T')[0];

      const currentCycleDay = calculateCycleDay(lastPeriodStartString);
      const nextPeriodDate = calculateNextPeriodDate(
        lastPeriodStartString,
        averageCycleLength
      );
      const fertileWindow = calculateFertileWindow(lastPeriodStartString);
      const ovulationDate = calculateOvulationDate(lastPeriodStartString);

      const nextPeriod = new Date(nextPeriodDate);
      const today = new Date();
      const daysUntilNextPeriod = Math.max(
        0,
        Math.ceil(
          (nextPeriod.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        )
      );

      // Enhanced fertility analysis
      const fertilityAnalysis = calculateFertilityAnalysis(
        lastPeriodStartString,
        averageCycleLength
      );

      const conceptionTiming = calculateConceptionTiming(
        lastPeriodStartString,
        averageCycleLength
      );

      const periodStatus = calculatePeriodStatus(
        sortedHistory,
        averageCycleLength
      );

      const stats: PeriodStats = {
        averageCycleLength,
        currentCycleDay,
        daysUntilNextPeriod,
        nextPeriodDate: nextPeriodDate,
        fertileWindowStart: fertileWindow.start,
        fertileWindowEnd: fertileWindow.end,
        ovulationDate: ovulationDate,
        averagePeriodLength,
        totalCyclesTracked: history.length,
        // Enhanced analysis
        fertilityAnalysis,
        conceptionTiming,
        periodStatus,
      };

      return stats;
    } catch (error) {
      console.error('❌ Error calculating period stats:', error);
      return null;
    }
  }

  /**
   * Get observable for period history changes
   */
  get periodHistory$(): Observable<PeriodEntry[]> {
    return this.periodHistorySubject.asObservable();
  }

  /**
   * Get observable for period stats changes
   */
  get periodStats$(): Observable<PeriodStats | null> {
    return this.periodStatsSubject.asObservable();
  }

  /**
   * Get current ongoing period (period without cycle_length)
   */
  getCurrentOngoingPeriod(): PeriodEntry | null {
    const history = this.periodHistorySubject.value;
    if (!history || history.length === 0) {
      return null;
    }

    // Find the most recent period without a cycle_length (ongoing period)
    const ongoingPeriod = history.find((entry) => !entry.cycle_length);
    return ongoingPeriod || null;
  }

  /**
   * Check if there's currently an ongoing period
   */
  hasOngoingPeriod(): boolean {
    return this.getCurrentOngoingPeriod() !== null;
  }

  /**
   * Get days since period started (for ongoing periods)
   */
  getDaysSincePeriodStarted(): number {
    const ongoingPeriod = this.getCurrentOngoingPeriod();
    if (!ongoingPeriod) {
      return 0;
    }

    const startDate = new Date(ongoingPeriod.start_date);
    const today = new Date();
    const diffTime = today.getTime() - startDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(1, diffDays); // At least 1 day
  }
}
