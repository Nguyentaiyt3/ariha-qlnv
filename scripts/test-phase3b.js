const mongoose = require("mongoose");

async function testPhase3B() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/ariha-test");

    const db = mongoose.connection.db;

    // Create test trial with 100% enrollment
    const testTrial = {
      _id: `trial_test_${Date.now()}`,
      code: `TEST-100-${Date.now().toString().slice(-4)}`,
      title: "Test Trial for Phase 3B Milestone",
      abbreviation: "TEST-100",
      status: "running_enrolled",
      principalInvestigatorId: "user_test_pi",
      principalInvestigatorName: "Dr. Test PI",
      coordinatorId: "user_test_coordinator",
      department: "Testing",
      sponsor: "Test Sponsor",
      startPeriod: "2026-01-01",
      endPeriod: "2026-12-31",
      enrollment: {
        targetSite: 100,
        enrolledAtSite: 100, // 100% enrollment = should trigger milestone
        icfSigned: 95,
        randomized: 90,
        screeningFailure: 5,
        aeCount: 2,
        saeCount: 0,
      },
      createdBy: "user_test_admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Insert test trial
    const result = await db.collection("clinical_trials").insertOne(testTrial);
    console.log(`✓ Test trial created: ${testTrial._id}`);
    console.log(`  Code: ${testTrial.code}`);
    console.log(`  Enrollment: ${testTrial.enrollment.enrolledAtSite}/${testTrial.enrollment.targetSite} (100%)`);
    console.log(`  Coordinator: ${testTrial.coordinatorId}`);

    process.exit(0);
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

testPhase3B();
