import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DoctorHeaderComponent } from './doctor-header.component';

describe('HeaderComponent', () => {
  let component: DoctorHeaderComponent;
  let fixture: ComponentFixture<DoctorHeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DoctorHeaderComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DoctorHeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
