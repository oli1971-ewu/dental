# Dental Patient Tracking & Management System (V1.0)
### Dhaka Dental Care & Implant Center (Bangladesh) — Currency: BDT (৳)

---

## 1. System Architecture & Overview

The Dental Patient Tracking & Management System V1.0 is a full-stack web application designed for multi-doctor dental practices in Bangladesh. 

### Core Architectural Principle:
- **One Patient = One Centralized Profile**: Every registered patient receives a permanent unique Patient ID (e.g. `DP-1001`).
- **Multiple Doctors = Shared Access to the Same Patient History**: Doctors are never partitioned into private patient silos. Doctor A, Doctor B, and Doctor C access the same patient record and see all historical diagnoses, treatments, radiographs, and payments.
- **Unlimited Visits = Permanent Chronological Records**: Each visit has a unique Visit ID (e.g. `VST-1001`), recording the attending doctor, clinical complaints, treatments, diagnostic tests/X-rays, payments, and dues.

---

## 2. User Roles & Permission Matrix

| Module / Action | Main Doctor (Super Admin) | Developer (Full Access) | Doctor (Individual Account) |
| :--- | :---: | :---: | :---: |
| Centralized Patient Database (Search & View) | Full Access | Full Access | Full Access |
| Register New Patient | Allowed | Allowed | Allowed |
| View Patient History Created by Other Doctors | Full Access | Full Access | Full Access |
| Add New Visit to Existing Patient | Allowed | Allowed | Allowed |
| Edit Own Visit Records | Allowed | Allowed | Allowed |
| Edit Other Doctors' Visit Records | Allowed | Allowed | Read-only |
| Diagnostic Tests & X-ray Tracking (OPG, IOPA, CBCT) | Full Access | Full Access | Full Access |
| Payment & Dues Recording (Cash, bKash, Nagad) | Full Access | Full Access | Full Access |
| Doctor Account Management (Create / Deactivate) | Full Access | Full Access | Restricted |
| Audit Trail & Sensitive Logs | Full Access | Full Access | Restricted |
| Database Snapshot & Backup Export | Allowed | Allowed | Restricted |
| CSV Data Exports (Patients, Visits, Payments, Tests) | Allowed | Allowed | Allowed |

---

## 3. Database Schema (PostgreSQL on Cloud SQL)

The application utilizes PostgreSQL on Google Cloud SQL with Drizzle ORM:

1. **`users`**:
   - `id`, `uid`, `username`, `password_hash`, `email`, `full_name`, `role` (`main_doctor` | `developer` | `doctor`), `is_active`, `phone`, `specialization`, `qualifications`, `joining_date`, `created_at`.
2. **`patients`**:
   - `id`, `patient_id` (Unique, e.g. `DP-1001`), `name`, `phone`, `alt_phone`, `age`, `gender`, `address`, `registration_date`, `medical_history`, `allergies`, `existing_diseases`, `notes`, `created_by`.
3. **`visits`**:
   - `id`, `visit_id` (Unique, e.g. `VST-1001`), `patient_id` (FK `patients`), `doctor_id` (FK `users`), `visit_date`, `visit_time`, `complaints`, `diagnosis`, `notes`, `next_follow_up_date`, `total_treatment_cost`, `total_test_cost`, `additional_charges`, `discount`, `total_cost`, `amount_paid`, `outstanding_due`, `status`.
4. **`treatments`**:
   - `id`, `visit_id` (FK `visits`), `patient_id` (FK `patients`), `doctor_id` (FK `users`), `treatment_name`, `description`, `tooth_number`, `cost`, `status`, `notes`, `treatment_date`.
5. **`diagnostic_tests`**:
   - `id`, `visit_id` (FK `visits`), `patient_id` (FK `patients`), `doctor_id` (FK `users`), `test_name`, `category` (`Dental X-ray` | `OPG` | `IOPA` | `CBCT` | `Other`), `description`, `cost`, `status`, `notes`, `test_date`.
6. **`payments`**:
   - `id`, `payment_id` (Unique, e.g. `PAY-1001`), `patient_id`, `visit_id`, `amount`, `payment_method` (`Cash` | `bKash` | `Nagad` | `Bank transfer` | `Other`), `transaction_ref`, `notes`, `received_by`, `payment_date`.
7. **`appointments`**:
   - `id`, `patient_id`, `visit_id`, `doctor_id`, `follow_up_date`, `reason`, `status` (`Scheduled` | `Completed` | `Cancelled` | `Missed`), `notes`.
8. **`audit_logs`**:
   - `id`, `user_id`, `user_role`, `action`, `affected_record`, `details`, `created_at`.
9. **`system_settings`**:
   - `id`, `key` (Unique), `value`, `description`, `updated_at`.

---

## 4. Default Seed Accounts & Credentials

For immediate demonstration and testing of the shared patient tracking scenario:

| Role | Username | Password | Doctor / User Name | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Main Doctor** | `` | `` | Prof. Dr. Kazi M. Rahman | Clinic Owner & Super Admin |
| **Developer** | `` | `` | Farhan Ahmed | Technical Admin & Database Backup |
| **Doctor A** | `` | `` | Dr. Rahim Chowdhury | Senior Dental Surgeon (Visit 1) |
| **Doctor B** | `` | `` | Dr. Fatima Akter | Endodontist & Conservative (Visit 2) |
| **Doctor C** | `` | `` | Dr. Tariqul Islam | Orthodontics & Surgery (Visit 3) |

*Tip: You can also use the **1-Click Test Login** buttons on the Login page to switch between doctors instantly.*

---

## 5. Mandatory Scenario Walkthrough (Doctor A &rarr; Doctor B &rarr; Doctor C)

Pre-seeded for Patient **Tanvir Hasan (`DP-1001`)**:

1. **Visit 1 by Doctor A (Dr. Rahim)**:
   - Complaint: Severe lower left molar pain (#36).
   - Diagnosis: Acute Irreversible Pulpitis #36.
   - Treatment: Emergency Pulp Extirpation (৳1,000).
   - Test: Pre-op IOPA X-ray (৳300).
   - Total Cost: ৳1,300. Paid: ৳1,300 (Cash). Due: ৳0.
2. **Visit 2 by Doctor B (Dr. Fatima)**:
   - Doctor B logs in, searches for `DP-1001`, and opens the profile.
   - Doctor B reviews Doctor A's diagnosis and pre-op radiograph.
   - Doctor B performs Molar RCT (৳5,000) and takes 2 IOPA radiographs (৳600).
   - Total Cost: ৳5,000 (after ৳600 discount). Received: ৳3,000 via bKash.
   - Visit Due: ৳2,000.
3. **Visit 3 by Doctor C (Dr. Tariq)**:
   - Doctor C logs in, opens `DP-1001`, and sees both Doctor A and Doctor B's records.
   - Doctor C prepares Zirconia Crown (৳8,500), takes an OPG radiograph (৳1,200), and records lab charges.
   - Total Cost: ৳9,000. Received: ৳5,000 (Cash advance).
   - Visit Due: ৳4,000.
4. **Centralized Patient Due Calculation**:
   - Total Patient Expenses: ৳15,300
   - Total Amount Paid: ৳9,300
   - Patient-wide Outstanding Due: **৳6,000** (৳2,000 from Visit 2 + ৳4,000 from Visit 3).
