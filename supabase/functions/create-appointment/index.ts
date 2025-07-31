import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { connect } from "https://deno.land/x/redis@v0.29.4/mod.ts";
import nodemailer from "npm:nodemailer";
// Error and Success Response Functions
function createErrorResponse(error, status = 400, details = null) {
  const response = {
    error,
    details
  };
  return new Response(JSON.stringify(response), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
function createSuccessResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
// Initialize Redis client
const redisConfig = {
  hostname: "redis-16115.c232.us-east-1-2.ec2.redns.redis-cloud.com",
  port: 16115,
  password: "TTscija9E5nQS9xCyypEjeA2xfhdibSE"
};
let redis = null;
try {
  redis = await connect(redisConfig);
  console.log(JSON.stringify({
    level: "info",
    message: "Connected to Redis",
    details: {
      hostname: redisConfig.hostname,
      port: redisConfig.port
    }
  }));
} catch (error) {
  console.log(JSON.stringify({
    level: "error",
    message: "Failed to connect to Redis",
    details: error.message
  }));
}
    const { data: doctor, error: doctorError } = await supabase.from("doctor_details").select("doctor_id").eq("doctor_id", doctor_id).single();
    if (doctorError || !doctor) {
    // Validate the selected doctor
    const { data: doctor, error: doctorError } = await supabase.from("doctor_details").select("doctor_id").eq("doctor_id", doctor_id).single();
    if (doctorError || !doctor) {
    }
    if (!availableSlots || availableSlots.length === 0) {
      console.log(JSON.stringify({
        level: "warn",
        message: "No available slots found for doctor",
        details: {
          doctor_id,
          targetDate,
          schedule
        }
      }));
      return createErrorResponse(`The selected doctor is not available for ${schedule} schedule on ${targetDate}. Please choose a different doctor, date, or time.`, 400, {
        doctor_id,
        schedule,
        date: targetDate,
        time_range: timeRange,
        available_slots: 0,
        suggestion: "Try selecting a different doctor, date, or time schedule (Morning/Afternoon/Evening)"
      });
    }
    // Require specific time selection
    if (!preferred_slot_id && !preferred_time) {
      return createErrorResponse("Time slot selection is required. Please choose a specific time for your appointment.", 400, {
        doctor_id,
        schedule,
        date: targetDate,
        available_slots: availableSlots.map((slot)=>({
            slot_id: slot.doctor_slot_id,
            time: slot.slot_time,
            date: slot.slot_date
          })),
        suggestion: "Choose from the available time slots listed above"
      });
    }
    // Select slot based on preferences
    if (preferred_slot_id) {
      selectedSlot = availableSlots.find((slot)=>slot.doctor_slot_id === preferred_slot_id);
      if (!selectedSlot) {
        return createErrorResponse("The selected time slot is no longer available. Please choose a different time.", 400, {
          preferred_slot_id,
          doctor_id,
          available_slots: availableSlots.map((slot)=>({
              slot_id: slot.doctor_slot_id,
              time: slot.slot_time,
              date: slot.slot_date
            })),
          suggestion: "Choose from the available time slots listed above"
        });
      }
    } else if (preferred_time) {
      selectedSlot = availableSlots.find((slot)=>slot.slot_time === preferred_time);
      if (!selectedSlot) {
        return createErrorResponse(`The preferred time ${preferred_time} is not available. Please choose a different time.`, 400, {
          preferred_time,
          doctor_id,
          schedule,
          available_slots: availableSlots.map((slot)=>({
              slot_id: slot.doctor_slot_id,
              time: slot.slot_time,
              date: slot.slot_date
            })),
          suggestion: "Choose from the available time slots listed above"
        });
      }
    }
    console.log(JSON.stringify({
      level: "info",
      message: "Selected slot",
      details: selectedSlot
    }));
    // Book the selected slot
    const { data: bookResult, error: bookError } = await supabase.rpc("book_appointment_slot", {
      p_slot_id: selectedSlot.doctor_slot_id
    });
    if (bookError || !bookResult) {
      console.log(JSON.stringify({
        level: "error",
        message: "Slot booking error",
        details: bookError?.message
      }));
      return createErrorResponse("Failed to book the appointment slot", 500, bookError?.message);
    }
    // Verify slot booking
    const { data: bookedSlot, error: verifyError } = await supabase.from("doctor_slot_assignments").select("appointments_count, max_appointments").eq("doctor_slot_id", selectedSlot.doctor_slot_id).single();
    if (verifyError || !bookedSlot) {
      console.log(JSON.stringify({
        level: "error",
        message: "Slot verification failed",
        details: verifyError?.message || "Slot not found"
      }));
      return createErrorResponse("Failed to verify booked slot", 500, verifyError?.message || "Slot not found");
    }
    }
    if (!availableSlots || availableSlots.length === 0) {
      console.log(JSON.stringify({
        level: "warn",
        message: "No available slots found for doctor",
        details: {
          doctor_id,
          targetDate,
          schedule
        }
      }));
      return createErrorResponse(`The selected doctor is not available for ${schedule} schedule on ${targetDate}. Please choose a different doctor, date, or time.`, 400, {
        doctor_id,
        schedule
        });
      }
        });
      }
    }

      console.log(JSON.stringify({
        level: "error",
        message: "Slot booking error",
        details: bookError?.message
      }));
      return createErrorResponse("Failed to book the appointment slot", 500, bookError?.message);
    }
    // Fix 4: Verify slot booking
    const { data: bookedSlot, error: verifyError } = await supabase.from("doctor_slot_assignments").select("appointments_count, max_appointments").eq("doctor_slot_id", selectedSlot.doctor_slot_id).single();
    if (verifyError || !bookedSlot) {
      console.log(JSON.stringify({
        level: "error",
        message: "Slot verification failed",
        details: verifyError?.message || "Slot not found"
      }));
      return createErrorResponse("Failed to verify booked slot", 500, verifyError?.message || "Slot not found");
    }
   // Fix 5: Check for existing guest by phone
        guestId = existingGuest.guest_id;
      } else {
        // Use existing guest ID
        guestId = existingGuest.guest_id;
      } else {
    // Fetch staff schedules for notifications
    if (redis) {
      const isGuest = !!newAppointment.guest_appointment_id;
      const notificationChannel = "appointment_notifications";
      const notifications = relevantStaff.map((schedule)=>({
          staff_id: schedule.staff_id,
          notification_type: "new_appointment",
          sent_at: new Date().toISOString(),
          appointment_id: isGuest ? newAppointment.guest_appointment_id : newAppointment.appointment_id,
          appointment_details: {
            appointment_date: bookedSlotInfo.slot_date,
            appointment_time: bookedSlotInfo.slot_time,
            doctor_id: bookedSlotInfo.doctor_id,
            schedule,
            visit_type,
            patient_name: isGuest ? fullName : newAppointment.patients?.full_name,
            patient_email: email || `${phone}@placeholder.com`,
            patient_phone: phone
          },
          staff_details: {
            staff_email: schedule.staff_members.working_email,
            staff_name: schedule.staff_members.full_name,
            staff_role: schedule.staff_members.role
          }
        }));
      // Nodemailer setup
      const transporter = nodemailer.createTransport({
        host: Deno.env.get("SMTP_HOST") || "smtp.gmail.com",
        port: parseInt(Deno.env.get("SMTP_PORT")) || 587,
        secure: false,
        auth: {
          user: Deno.env.get("SMTP_USER"),
          pass: Deno.env.get("SMTP_PASS")
        }
      });
      // Notification handling
      try {
        const results = await Promise.allSettled(notifications.map(async (notification)=>{
          try {
            // Publish to Redis
            await redis.publish(notificationChannel, JSON.stringify(notification));
            console.log(JSON.stringify({
              level: "info",
              message: "Published notification to Redis",
              details: {
                channel: notificationChannel,
                staff_id: notification.staff_id,
                appointment_id: notification.appointment_id
              }
            }));
            // Send email
            const mailOptions = {
              from: Deno.env.get("SMTP_FROM_EMAIL") || "no-reply@yourdomain.com",
              to: notification.staff_details.staff_email,
              subject: `New Appointment Notification #${notification.appointment_id}`,
              html: `
                  <h2>New Appointment Created</h2>
                  <p>Dear Staff,</p>
                  <p>A new appointment has been scheduled.</p>
                  <p><strong>Appointment ID:</strong> ${notification.appointment_id}</p>
                  <p><strong>Staff ID:</strong> ${notification.staff_id}</p>
                  <p><strong>Type:</strong> ${notification.notification_type}</p>
                  <p><strong>Sent At:</strong> ${new Date(notification.sent_at).toLocaleString()}</p>
                  <p>Please check the system for more details.</p>
                `
            };
            await transporter.sendMail(mailOptions);
            console.log(JSON.stringify({
              level: "info",
              message: "Email notification sent",
              details: {
                to: notification.staff_details.staff_email,
                appointment_id: notification.appointment_id
              }
            }));
            return {
              success: true,
              staff_id: notification.staff_id
            };
          } catch (err) {
            console.error(JSON.stringify({
              level: "error",
              message: "Failed to send notification",
              details: {
                staff_id: notification.staff_id,
                error: err.message
              }
            }));
            return {
              success: false,
              staff_id: notification.staff_id,
              error: err.message
            };
          }
        }));
        const failed = results.filter((r)=>r.status === "fulfilled" && !r.value.success);
        const success = results.filter((r)=>r.status === "fulfilled" && r.value.success);
        return createSuccessResponse({
          success: true,
          message: `Appointment created. ${success.length} staff notified via Redis & Email, ${failed.length} failed.`,
          data: {
            appointment: newAppointment,
            slot_info: bookedSlotInfo,
            notifications: notifications.map((n)=>({
                staff_id: n.staff_id,
                staff_email: n.staff_details.staff_email,
                notification_type: n.notification_type,
                sent_at: n.sent_at,
                appointment_id: n.appointment_id
              })),
            failed_notifications: failed.map((f)=>({
                staff_id: f.value?.staff_id || "unknown",
                error: f.value?.error || "Unknown error"
              }))
          }
        });
      } catch (error) {
        console.error(JSON.stringify({
          level: "error",
          message: "Global error during notification handling",
          details: {
            error: error.message
          }
        }));
        return createErrorResponse("Failed to process notifications", 500, error.message);
      } finally{
        // Close Redis connection
        if (redis) {
          try {
            await redis.close();
            console.log(JSON.stringify({
              level: "info",
              message: "Redis connection closed"
            }));
          } catch (error) {
            console.log(JSON.stringify({
              level: "error",
              message: "Failed to close Redis connection",
              details: error.message
            }));
          }
        }
      }
    } else {
      return createSuccessResponse({
        success: true,
        message: "Appointment created, but Redis is not connected. No notifications sent.",
        data: {
          appointment: newAppointment,
          slot_info: bookedSlotInfo
        }
      });
    }
