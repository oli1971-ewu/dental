import bcrypt from 'bcryptjs';
import { db } from './index.ts';
import {
  users,
  patients,
  visits,
  treatments,
  diagnosticTests,
  payments,
  appointments,
  auditLogs,
  systemSettings,
  applicationFeatureFlags,
  prescriptions,
  prescriptionMedicines,
  prescriptionAuditLogs,
} from './schema.ts';
import { ensureMedicineCatalogSeeded } from '../server/medicines.ts';
import { count, eq, inArray, asc, isNull, and } from 'drizzle-orm';

async function reconcileExistingPatientBalances() {
  try {
    const allPatients = await db.select().from(patients);
    for (const pat of allPatients) {
      const pVisits = await db
        .select()
        .from(visits)
        .where(eq(visits.patientId, pat.id))
        .orderBy(asc(visits.visitDate), asc(visits.id));
      if (pVisits.length <= 1) continue;

      let runningDue = 0;
      for (let i = 0; i < pVisits.length; i++) {
        const v = pVisits[i];
        const isLatest = i === pVisits.length - 1;
        const netCost = parseFloat(v.totalCost || '0');
        const paid = parseFloat(v.amountPaid || '0');
        runningDue = Math.max(0, Number((runningDue + netCost - paid).toFixed(2)));
        const targetOutstanding = isLatest ? runningDue.toFixed(2) : '0.00';
        if (v.outstandingDue !== targetOutstanding) {
          await db
            .update(visits)
            .set({ outstandingDue: targetOutstanding })
            .where(eq(visits.id, v.id));
        }
      }
    }
  } catch (e) {
    console.error('Error reconciling patient balances:', e);
  }
}

async function ensureTomorrowFollowUpsAndBranding() {
  try {
    await db
      .update(users)
      .set({
        fullName: 'Aymon (Lead Developer)',
        email: 'aymon@dentalcare.com',
      })
      .where(eq(users.username, 'dev_admin'));

    // Migrate old seeded user emails to @dentalcare.com if still using @nasirdentalcare.com
    const emailMigrations = [
      { username: 'maindoctor', email: 'dr.rahman@dentalcare.com' },
      { username: 'dr_rahim', email: 'dr.rahim@dentalcare.com' },
      { username: 'dr_fatima', email: 'dr.fatima@dentalcare.com' },
      { username: 'dr_tariq', email: 'dr.tariq@dentalcare.com' },
    ];
    for (const m of emailMigrations) {
      await db.update(users).set({ email: m.email }).where(eq(users.username, m.username));
    }

    const existingClinicSetting = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'clinic_name'));

    if (existingClinicSetting.length > 0) {
      if (
        existingClinicSetting[0].value.includes('Dhaka Dental') ||
        existingClinicSetting[0].value.includes('Nasir Dental Care') ||
        existingClinicSetting[0].value === 'Dental Patient Tracking'
      ) {
        await db
          .update(systemSettings)
          .set({ value: 'Dental Care', updatedAt: new Date() })
          .where(eq(systemSettings.key, 'clinic_name'));
      }
    } else {
      await db.insert(systemSettings).values({
        key: 'clinic_name',
        value: 'Dental Care',
        description: 'Name of the dental clinic',
      });
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const existingAppointments = await db.select().from(appointments);
    const hasTomorrowScheduled = existingAppointments.some(
      (a) => a.followUpDate === tomorrowStr && a.status === 'Scheduled'
    );

    if (!hasTomorrowScheduled) {
      const allPatients = await db.select().from(patients).orderBy(asc(patients.id));
      const allDoctors = await db
        .select()
        .from(users)
        .where(eq(users.role, 'doctor'))
        .orderBy(asc(users.id));

      if (allPatients.length >= 1 && allDoctors.length >= 1) {
        const scheduledApps = existingAppointments.filter((a) => a.status === 'Scheduled');
        if (scheduledApps.length > 0) {
          await db
            .update(appointments)
            .set({ followUpDate: tomorrowStr })
            .where(eq(appointments.id, scheduledApps[0].id));
        } else {
          await db.insert(appointments).values({
            patientId: allPatients[0].id,
            doctorId: allDoctors[0].id,
            followUpDate: tomorrowStr,
            reason: 'Permanent Zirconia Crown Trial & Bite Evaluation',
            status: 'Scheduled',
            notes: 'Verify occlusion and margins prior to final cementation.',
          });
        }

        if (allPatients.length >= 2) {
          const secondPatient = allPatients[1];
          const secondDoctor = allDoctors[1] || allDoctors[0];
          const alreadyHasSecond = existingAppointments.some(
            (a) => a.patientId === secondPatient.id && a.status === 'Scheduled'
          );
          if (!alreadyHasSecond) {
            await db.insert(appointments).values({
              patientId: secondPatient.id,
              doctorId: secondDoctor.id,
              followUpDate: tomorrowStr,
              reason: 'Post-Scaling Gingival Healing & Periodontal Review',
              status: 'Scheduled',
              notes: 'Check gingival inflammation and oral hygiene compliance.',
            });
          }
        }
      }
    }
  } catch (e) {
    console.error('Error syncing branding and tomorrow follow-ups:', e);
  }
}

async function ensurePrescriptionModuleBootstrap() {
  try {
    // Idempotently insert 'prescription_management' feature flag if it does not yet exist
    // Preserves developer ON/OFF preference across restarts via onConflictDoNothing
    await db
      .insert(applicationFeatureFlags)
      .values({
        featureKey: 'prescription_management',
        featureName: 'Prescription Management',
        description:
          'Controls access to digital dental prescriptions, dynamic medicine entries, patient prescription history, revision workflows, and A4 PDF generation across all doctor portals.',
        isEnabled: true,
      })
      .onConflictDoNothing({ target: applicationFeatureFlags.featureKey });

    // Populate clinic doctor BMDC registration numbers if null
    const regMigrations = [
      { username: 'maindoctor', reg: 'BMDC Reg: A-28410' },
      { username: 'dr_rahim', reg: 'BMDC Reg: A-51904' },
      { username: 'dr_fatima', reg: 'BMDC Reg: A-60312' },
      { username: 'dr_tariq', reg: 'BMDC Reg: A-64891' },
    ];
    for (const r of regMigrations) {
      await db
        .update(users)
        .set({ registrationNumber: r.reg })
        .where(andNullCheck(r.username));
    }

    // One-time demo prescription seed only if never seeded before and DP-1001/VST-1002 exist
    const seededCheck = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, 'prescription_demo_seeded'));

    if (seededCheck.length === 0) {
      const existingRxCount = await db.select({ count: count() }).from(prescriptions);
      if (Number(existingRxCount[0]?.count || 0) === 0) {
        const [pat1] = await db.select().from(patients).where(eq(patients.patientId, 'DP-1001'));
        const [vst2] = await db.select().from(visits).where(eq(visits.visitId, 'VST-1002'));
        const [docB] = await db.select().from(users).where(eq(users.username, 'dr_fatima'));

        if (pat1 && vst2 && docB) {
          const [rx] = await db
            .insert(prescriptions)
            .values({
              prescriptionNumber: 'RX-1001',
              patientId: pat1.id,
              doctorId: docB.id,
              visitId: vst2.id,
              revisionNumber: 1,
              status: 'Finalized',
              prescriptionDate: vst2.visitDate,
              chiefComplaints: vst2.complaints || 'Follow-up for Root Canal Completion (#36).',
              clinicalFindings: 'Tooth #36 canals clean, dry, no periapical exudate, percussion mildly tender.',
              diagnosis: vst2.diagnosis || 'Tooth #36 post-obturation RCT completion.',
              treatmentPlan: 'Warm vertical obturation completed; composite core build-up placed. Refer for full-coverage Zirconia crown.',
              followUpDate: vst2.nextFollowUpDate || null,
              oralHygieneInstructions: 'Keep the treated quadrant clean; avoid sticky or hard foods on tooth #36 until final crown cementation.',
              toothBrushingInstructions: 'Brush gently twice daily with a soft-bristled toothbrush using modified Bass technique.',
              mouthwashRecommendations: 'Rinse with Chlorhexidine Gluconate 0.2% mouthwash (10 ml) twice daily for 7 days after brushing.',
              postTreatmentPrecautions: 'Mild chewing tenderness for 24–48 hours is normal after obturation. Contact clinic if swelling or severe throbbing occurs.',
              dietaryRecommendations: 'Chew on the opposite side for 48 hours; avoid cracking nuts, ice, or hard bones.',
              additionalClinicalAdvice: 'Note: Patient has documented Penicillin allergy — non-penicillin regimen prescribed.',
              finalizedAt: new Date(),
              finalizedBy: docB.id,
            })
            .returning();

          await db.insert(prescriptionMedicines).values([
            {
              prescriptionId: rx.id,
              sortOrder: 1,
              medicineName: 'Tab. Azithromycin',
              genericName: 'Azithromycin',
              strength: '500 mg',
              dosage: '1 tablet',
              frequency: '1+0+0',
              duration: '3 days',
              quantity: '3 tablets',
              mealInstructions: 'After meals',
              additionalNotes: 'Penicillin-safe antibiotic cover.',
            },
            {
              prescriptionId: rx.id,
              sortOrder: 2,
              medicineName: 'Tab. Ketorolac',
              genericName: 'Ketorolac Tromethamine',
              strength: '10 mg',
              dosage: '1 tablet',
              frequency: '1+0+1',
              duration: '3 days',
              quantity: '6 tablets',
              mealInstructions: 'After meals',
              additionalNotes: 'Take only if post-obturation pain persists.',
            },
            {
              prescriptionId: rx.id,
              sortOrder: 3,
              medicineName: 'Cap. Omeprazole',
              genericName: 'Omeprazole',
              strength: '20 mg',
              dosage: '1 capsule',
              frequency: '1+0+1',
              duration: '5 days',
              quantity: '10 capsules',
              mealInstructions: 'Before meals',
              additionalNotes: 'Gastric protection 30 mins before breakfast and dinner.',
            },
          ]);

          await db.insert(prescriptionAuditLogs).values({
            prescriptionId: rx.id,
            prescriptionNumber: rx.prescriptionNumber,
            userId: docB.id,
            userRole: 'doctor',
            action: 'CREATE_AND_FINALIZE_PRESCRIPTION',
            details: `Initial clinical prescription ${rx.prescriptionNumber} finalized for ${pat1.name} (${pat1.patientId}).`,
          });
        }
      }

      await db
        .insert(systemSettings)
        .values({
          key: 'prescription_demo_seeded',
          value: 'true',
          description: 'Tracks whether initial prescription sample was created',
        })
        .onConflictDoNothing({ target: systemSettings.key });
    }
  } catch (e) {
    console.error('Error bootstrapping prescription module:', e);
  }
}

function andNullCheck(username: string) {
  return and(eq(users.username, username), isNull(users.registrationNumber));
}

export async function seedInitialData() {
  try {
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const existingUsers = await db.select({ count: count() }).from(users);
    if (Number(existingUsers[0]?.count) > 0) {
      await db
        .update(patients)
        .set({ notes: null })
        .where(
          inArray(patients.notes, [
            'Needs fasting glucose check before surgical extractions.',
            'Routine dental consultation.',
            'Referred by friend. Very compliant patient.',
            'Chief complaint of bleeding gums during brushing.',
          ])
        );

      // Ensure Lead Developer name is updated to Aymon
      await db
        .update(users)
        .set({
          fullName: 'Aymon (Lead Developer)',
          email: 'aymon@dentalcare.com',
        })
        .where(eq(users.username, 'dev_admin'));

      // Ensure Clinic Name is updated to Dental Care
      await db
        .insert(systemSettings)
        .values({
          key: 'clinic_name',
          value: 'Dental Care',
          description: 'Name of the dental clinic',
        })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value: 'Dental Care', updatedAt: new Date() },
        });

      // Keep sample scheduled follow-up on tomorrow's date if it was on the old static seed date '2026-11-02'
      await db
        .update(appointments)
        .set({ followUpDate: tomorrowStr })
        .where(eq(appointments.followUpDate, '2026-11-02'));

      await reconcileExistingPatientBalances();
      await ensureTomorrowFollowUpsAndBranding();
      await ensurePrescriptionModuleBootstrap();
      await ensureMedicineCatalogSeeded();
      console.log('Database already initialized with users.');
      return;
    }

    console.log('Seeding initial clinic users and test scenario...');

    const salt = bcrypt.genSaltSync(10);
    const mainDoctorPass = bcrypt.hashSync('ClinicAdmin@2026', salt);
    const devPass = bcrypt.hashSync('DevDental@2026', salt);
    const doctorPass = bcrypt.hashSync('Doctor@123', salt);

    // 1. Create Users
    const [uMain] = await db
      .insert(users)
      .values({
        username: 'maindoctor',
        passwordHash: mainDoctorPass,
        email: 'dr.rahman@dentalcare.com',
        fullName: 'Prof. Dr. Kazi M. Rahman',
        role: 'main_doctor',
        isActive: true,
        phone: '+880 1711-234567',
        specialization: 'Senior Consultant & Prosthodontist',
        qualifications: 'BDS, FCPS (Oral & Maxillofacial Surgery), PhD (Tokyo)',
        joiningDate: '2020-01-15',
      })
      .returning();

    const [uDev] = await db
      .insert(users)
      .values({
        username: 'dev_admin',
        passwordHash: devPass,
        email: 'aymon@dentalcare.com',
        fullName: 'Aymon (Lead Developer)',
        role: 'developer',
        isActive: true,
        phone: '+880 1819-987654',
        specialization: 'Lead Full Stack & Database Architect',
        qualifications: 'B.Sc. in Computer Science & Engineering',
        joiningDate: '2022-06-01',
      })
      .returning();

    const [uDocA] = await db
      .insert(users)
      .values({
        username: 'dr_rahim',
        passwordHash: doctorPass,
        email: 'dr.rahim@dentalcare.com',
        fullName: 'Dr. Rahim Chowdhury',
        role: 'doctor',
        isActive: true,
        phone: '+880 1912-345678',
        specialization: 'General Dental Surgeon & Implantologist',
        qualifications: 'BDS (Dhaka Dental College), PGT (Operative)',
        joiningDate: '2023-03-10',
      })
      .returning();

    const [uDocB] = await db
      .insert(users)
      .values({
        username: 'dr_fatima',
        passwordHash: doctorPass,
        email: 'dr.fatima@dentalcare.com',
        fullName: 'Dr. Fatima Akter',
        role: 'doctor',
        isActive: true,
        phone: '+880 1612-876543',
        specialization: 'Endodontist & Conservative Dentistry',
        qualifications: 'BDS (Chittagong Medical College), MS (Endodontics)',
        joiningDate: '2023-08-01',
      })
      .returning();

    const [uDocC] = await db
      .insert(users)
      .values({
        username: 'dr_tariq',
        passwordHash: doctorPass,
        email: 'dr.tariq@dentalcare.com',
        fullName: 'Dr. Tariqul Islam',
        role: 'doctor',
        isActive: true,
        phone: '+880 1515-432109',
        specialization: 'Orthodontics & Dentofacial Orthopedics',
        qualifications: 'BDS, FCPS (Orthodontics Part-II), MPH',
        joiningDate: '2024-01-10',
      })
      .returning();

    // 2. Default System Settings & Treatment Pricing
    await db.insert(systemSettings).values([
      { key: 'clinic_name', value: 'Dental Care', description: 'Name of the dental clinic' },
      { key: 'clinic_address', value: 'House 42, Road 11, Banani, Dhaka-1213, Bangladesh', description: 'Clinic location' },
      { key: 'clinic_phone', value: '+880 2-9876543, +880 1711-234567', description: 'Contact phone' },
      { key: 'clinic_currency', value: 'BDT (৳)', description: 'Default currency' },
      {
        key: 'default_treatment_prices',
        value: JSON.stringify([
          { name: 'Dental Examination & Consultation', category: 'General', defaultCost: 500 },
          { name: 'Composite Dental Filling (Per Tooth)', category: 'Restorative', defaultCost: 1500 },
          { name: 'Root Canal Treatment (RCT - Molar)', category: 'Endodontics', defaultCost: 5000 },
          { name: 'Root Canal Treatment (RCT - Anterior)', category: 'Endodontics', defaultCost: 3500 },
          { name: 'Tooth Extraction (Simple)', category: 'Surgery', defaultCost: 1200 },
          { name: 'Surgical Disimpaction (Wisdom Tooth)', category: 'Surgery', defaultCost: 6000 },
          { name: 'Ultrasonic Scaling & Polishing (Full Mouth)', category: 'Preventive', defaultCost: 2000 },
          { name: 'Porcelain Fused to Metal (PFM) Crown', category: 'Prosthodontics', defaultCost: 4500 },
          { name: 'All-Ceramic Zirconia Crown', category: 'Prosthodontics', defaultCost: 8500 },
          { name: 'Dental Implant (Titanium Fixture + Abutment)', category: 'Implant', defaultCost: 45000 },
          { name: 'Orthodontic Consultation & Analysis', category: 'Orthodontics', defaultCost: 2000 },
          { name: 'Gingivectomy / Periodontal Flap', category: 'Periodontics', defaultCost: 4000 },
        ]),
        description: 'Standard treatment pricing list',
      },
      {
        key: 'default_test_prices',
        value: JSON.stringify([
          { name: 'Intraoral Periapical Radiograph (IOPA)', category: 'IOPA', defaultCost: 0 },
          { name: 'Orthopantomogram (OPG - Full Mouth Panoramic)', category: 'OPG', defaultCost: 0 },
          { name: 'Dental Cone Beam CT (CBCT - Single Jaw)', category: 'CBCT', defaultCost: 0 },
          { name: 'Bite-wing X-ray', category: 'Dental X-ray', defaultCost: 0 },
          { name: 'Blood Glucose Test (Random)', category: 'Other', defaultCost: 0 },
        ]),
        description: 'Standard diagnostic test and radiograph pricing list',
      },
    ]);

    // 3. Seed Sample Patients
    // Patient 1: Tanvir Hasan (Demonstrates the mandatory multi-doctor scenario: Doc A -> Doc B -> Doc C)
    const [p1] = await db
      .insert(patients)
      .values({
        patientId: 'DP-1001',
        name: 'Tanvir Hasan',
        phone: '01712345678',
        altPhone: '01898765432',
        age: 34,
        gender: 'Male',
        address: 'House 14, Road 4, Sector 7, Uttara, Dhaka',
        registrationDate: '2026-10-10',
        medicalHistory: 'Mild Hypertension (controlled on Amlodipine 5mg). No bleeding disorder.',
        allergies: 'Penicillin allergy (develops urticaria)',
        existingDiseases: 'Hypertension',
        notes: null,
        createdBy: uDocA.id,
      })
      .returning();

    // Patient 2: Nasrin Sultana
    const [p2] = await db
      .insert(patients)
      .values({
        patientId: 'DP-1002',
        name: 'Nasrin Sultana',
        phone: '01987654321',
        altPhone: '01755443322',
        age: 28,
        gender: 'Female',
        address: 'Block C, Lalmatia, Dhaka',
        registrationDate: '2026-10-18',
        medicalHistory: null,
        allergies: null,
        existingDiseases: null,
        notes: null,
        createdBy: uDocB.id,
      })
      .returning();

    // Patient 3: Md. Kabir Hossain
    const [p3] = await db
      .insert(patients)
      .values({
        patientId: 'DP-1003',
        name: 'Md. Kabir Hossain',
        phone: '01812334455',
        age: 52,
        gender: 'Male',
        address: 'Mirpur-10, Dhaka',
        registrationDate: '2026-10-22',
        medicalHistory: null,
        allergies: null,
        existingDiseases: null,
        notes: null,
        createdBy: uDocC.id,
      })
      .returning();

    // 4. Seed the Mandatory Scenario for Patient 1 (Tanvir Hasan):
    // Visit 1: Doctor A (Dr. Rahim) - Exam, IOPA X-ray, Diagnosis of Irreversible Pulpitis
    const [v1] = await db
      .insert(visits)
      .values({
        visitId: 'VST-1001',
        patientId: p1.id,
        doctorId: uDocA.id,
        visitDate: '2026-10-10',
        visitTime: '11:30',
        complaints: 'Severe throbbing pain in lower left molar (tooth #36), aggravated by cold and night pain.',
        diagnosis: 'Acute Irreversible Pulpitis on #36 with symptomatic apical periodontitis',
        notes: 'Advised emergency pulp extirpation and referral to Endodontist Dr. Fatima for RCT.',
        nextFollowUpDate: '2026-10-15',
        totalTreatmentCost: '1000.00',
        totalTestCost: '300.00',
        additionalCharges: '0.00',
        discount: '0.00',
        totalCost: '1300.00',
        amountPaid: '1300.00',
        outstandingDue: '0.00',
        status: 'Completed',
      })
      .returning();

    // Treatment in Visit 1
    await db.insert(treatments).values({
      visitId: v1.id,
      patientId: p1.id,
      doctorId: uDocA.id,
      treatmentName: 'Emergency Pulp Extirpation & Dressing',
      description: 'Opened canal orifice, extirpated pulp under local anesthesia, placed Ca(OH)2 dressing and temporary seal.',
      toothNumber: '36',
      cost: '1000.00',
      status: 'Completed',
      notes: 'Patient relieved of acute pain.',
      treatmentDate: '2026-10-10',
    });

    // Test in Visit 1
    await db.insert(diagnosticTests).values({
      visitId: v1.id,
      patientId: p1.id,
      doctorId: uDocA.id,
      testName: 'Intraoral Periapical Radiograph (IOPA)',
      category: 'IOPA',
      description: 'Pre-op IOPA of tooth #36 showing deep occlusal decay reaching pulp chamber.',
      cost: '300.00',
      status: 'Completed',
      notes: 'Roots are curved at apical third.',
      testDate: '2026-10-10',
    });

    // Payment for Visit 1
    await db.insert(payments).values({
      paymentId: 'PAY-1001',
      patientId: p1.id,
      visitId: v1.id,
      amount: '1300.00',
      paymentMethod: 'Cash',
      transactionRef: 'CSH-1001',
      notes: 'Full payment received at counter by Dr. Rahim.',
      receivedBy: uDocA.id,
      paymentDate: '2026-10-10',
    });

    // Visit 2: Doctor B (Dr. Fatima) - Seeing the same patient, reviewing Doctor A's notes, doing RCT
    const [v2] = await db
      .insert(visits)
      .values({
        visitId: 'VST-1002',
        patientId: p1.id,
        doctorId: uDocB.id,
        visitDate: '2026-10-15',
        visitTime: '15:00',
        complaints: 'Follow-up for Root Canal Completion. Pain is gone, temporary filling intact.',
        diagnosis: 'Tooth #36 undergoing multi-visit RCT, canals clean and dry.',
        notes: 'Cleaned and shaped 3 canals (MB, ML, Distal). Master cone radiograph taken. Obturation completed with gutta-percha and AH Plus sealer.',
        nextFollowUpDate: '2026-10-25',
        totalTreatmentCost: '5000.00',
        totalTestCost: '600.00',
        additionalCharges: '0.00',
        discount: '600.00',
        totalCost: '5000.00',
        amountPaid: '3000.00',
        outstandingDue: '0.00',
        status: 'Completed',
      })
      .returning();

    // Treatment in Visit 2
    await db.insert(treatments).values({
      visitId: v2.id,
      patientId: p1.id,
      doctorId: uDocB.id,
      treatmentName: 'Root Canal Treatment (Molar - 3 Canals)',
      description: 'Biomechanical preparation, irrigation with 3% NaOCl & EDTA, warm vertical compaction obturation.',
      toothNumber: '36',
      cost: '5000.00',
      status: 'Completed',
      notes: 'Core build-up with composite done.',
      treatmentDate: '2026-10-15',
    });

    // Tests in Visit 2 (2 radiographs: working length and post-obturation)
    await db.insert(diagnosticTests).values([
      {
        visitId: v2.id,
        patientId: p1.id,
        doctorId: uDocB.id,
        testName: 'IOPA Radiograph (Working Length)',
        category: 'IOPA',
        description: 'Working length determination of #36 MB, ML, and Distal canals.',
        cost: '300.00',
        status: 'Completed',
        notes: 'MB: 21mm, ML: 20.5mm, D: 21.5mm',
        testDate: '2026-10-15',
      },
      {
        visitId: v2.id,
        patientId: p1.id,
        doctorId: uDocB.id,
        testName: 'IOPA Radiograph (Post-Obturation)',
        category: 'IOPA',
        description: 'Post-obturation check showing dense hermetic seal to radiographic apex.',
        cost: '300.00',
        status: 'Completed',
        notes: 'Satisfactory seal. Patient advised to get crown.',
        testDate: '2026-10-15',
      },
    ]);

    // Partial Payment 1 for Visit 2 (bKash ৳3000)
    await db.insert(payments).values({
      paymentId: 'PAY-1002',
      patientId: p1.id,
      visitId: v2.id,
      amount: '3000.00',
      paymentMethod: 'bKash',
      transactionRef: 'BK-9A7B318F',
      notes: 'Partial payment received via bKash. Remaining due: ৳2,000.',
      receivedBy: uDocB.id,
      paymentDate: '2026-10-15',
    });

    // Visit 3: Doctor C (Dr. Tariq) - Seeing patient for Crown preparation and OPG review
    const [v3] = await db
      .insert(visits)
      .values({
        visitId: 'VST-1003',
        patientId: p1.id,
        doctorId: uDocC.id,
        visitDate: '2026-10-25',
        visitTime: '17:30',
        complaints: 'Referred by Dr. Fatima for crown preparation of #36 and overall occlusion evaluation.',
        diagnosis: 'Tooth #36 RCT-treated, requires full coverage Zirconia crown. Mild anterior crowding.',
        notes: 'Tooth preparation completed with deep chamfer margin. Impression taken with polyether and sent to laboratory. Temporary crown cemented.',
        nextFollowUpDate: '2026-11-02',
        totalTreatmentCost: '8500.00',
        totalTestCost: '1200.00',
        additionalCharges: '300.00',
        discount: '1000.00',
        totalCost: '9000.00',
        amountPaid: '5000.00',
        outstandingDue: '6000.00',
        status: 'Completed',
      })
      .returning();

    // Treatment in Visit 3
    await db.insert(treatments).values({
      visitId: v3.id,
      patientId: p1.id,
      doctorId: uDocC.id,
      treatmentName: 'All-Ceramic Zirconia Crown (Tooth #36)',
      description: 'Full tooth preparation, gingival retraction, double-mix impression, provisional crown cementation.',
      toothNumber: '36',
      cost: '8500.00',
      status: 'Ongoing',
      notes: 'Lab order dispatched to Modern Dental Lab.',
      treatmentDate: '2026-10-25',
    });

    // Diagnostic Test in Visit 3 (OPG)
    await db.insert(diagnosticTests).values({
      visitId: v3.id,
      patientId: p1.id,
      doctorId: uDocC.id,
      testName: 'Orthopantomogram (OPG - Full Panoramic)',
      category: 'OPG',
      description: 'Full mouth panoramic radiograph to evaluate general alveolar bone and TMJ.',
      cost: '1200.00',
      status: 'Completed',
      notes: 'General bone levels within normal limits.',
      testDate: '2026-10-25',
    });

    // Payment for Visit 3 (Cash ৳5000)
    await db.insert(payments).values({
      paymentId: 'PAY-1003',
      patientId: p1.id,
      visitId: v3.id,
      amount: '5000.00',
      paymentMethod: 'Cash',
      transactionRef: 'CSH-1002',
      notes: 'Advance crown payment received. Remaining visit due: ৳4,000.',
      receivedBy: uDocC.id,
      paymentDate: '2026-10-25',
    });

    // Follow-up for Patient 1
    await db.insert(appointments).values({
      patientId: p1.id,
      visitId: v3.id,
      doctorId: uDocC.id,
      followUpDate: '2026-11-02',
      reason: 'Permanent Zirconia Crown Trial & Cementation',
      status: 'Scheduled',
      notes: 'Verify bite and contact points before final resin cementation.',
    });

    // Patient 2 Visits & Payments (Scaling with Dr. Fatima)
    const [v4] = await db
      .insert(visits)
      .values({
        visitId: 'VST-1004',
        patientId: p2.id,
        doctorId: uDocB.id,
        visitDate: '2026-10-18',
        visitTime: '10:00',
        complaints: 'Gingival bleeding and calculus buildup.',
        diagnosis: 'Generalized Chronic Marginal Gingivitis with subgingival calculus',
        notes: 'Full mouth ultrasonic scaling and subgingival curettage done. Chlorhexidine mouthwash prescribed.',
        nextFollowUpDate: '2026-11-18',
        totalTreatmentCost: '2000.00',
        totalTestCost: '0.00',
        additionalCharges: '0.00',
        discount: '0.00',
        totalCost: '2000.00',
        amountPaid: '2000.00',
        outstandingDue: '0.00',
        status: 'Completed',
      })
      .returning();

    await db.insert(treatments).values({
      visitId: v4.id,
      patientId: p2.id,
      doctorId: uDocB.id,
      treatmentName: 'Ultrasonic Scaling & Polishing (Full Mouth)',
      description: 'Supragingival and subgingival ultrasonic scaling with polishing paste.',
      cost: '2000.00',
      status: 'Completed',
      treatmentDate: '2026-10-18',
    });

    await db.insert(payments).values({
      paymentId: 'PAY-1004',
      patientId: p2.id,
      visitId: v4.id,
      amount: '2000.00',
      paymentMethod: 'Nagad',
      transactionRef: 'NGD-882199',
      notes: 'Full payment cleared via Nagad.',
      receivedBy: uDocB.id,
      paymentDate: '2026-10-18',
    });

    // 5. Audit Log Initial Records
    await db.insert(auditLogs).values([
      {
        userId: uDev.id,
        userRole: 'developer',
        action: 'SYSTEM_INITIALIZATION',
        affectedRecord: 'System Settings',
        details: 'Initial clinic database schema, pricing, and default doctor accounts configured.',
      },
      {
        userId: uDocA.id,
        userRole: 'doctor',
        action: 'CREATE_PATIENT',
        affectedRecord: 'Patient DP-1001 (Tanvir Hasan)',
        details: 'Registered new patient with severe dental pain.',
      },
      {
        userId: uDocB.id,
        userRole: 'doctor',
        action: 'CREATE_VISIT',
        affectedRecord: 'Visit VST-1002 (Patient DP-1001)',
        details: 'Added root canal treatment session following referral from Dr. Rahim.',
      },
      {
        userId: uDocC.id,
        userRole: 'doctor',
        action: 'CREATE_VISIT',
        affectedRecord: 'Visit VST-1003 (Patient DP-1001)',
        details: 'Added crown preparation visit under shared patient profile.',
      },
    ]);

    await ensurePrescriptionModuleBootstrap();
    await ensureMedicineCatalogSeeded();
    console.log('Database seeding successfully finished!');
  } catch (error) {
    console.error('Error during database seed:', error);
  }
}
