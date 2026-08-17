import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

// Initialize Firebase Admin only once
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

const db = getDatabase();

export default async function handler(req, res) {
  // Only POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    // --------------------------------
    // 1. Get Firebase ID token
    // --------------------------------

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const idToken = authHeader.split("Bearer ")[1];

    // --------------------------------
    // 2. Verify the Firebase user
    // --------------------------------

    const { getAuth } = await import("firebase-admin/auth");

    const decodedToken = await getAuth().verifyIdToken(idToken);

    const uid = decodedToken.uid;

    // --------------------------------
    // 3. Get level + submitted answer
    // --------------------------------

    const { level, answer } = req.body || {};

    if (level === undefined || answer === undefined) {
      return res.status(400).json({
        error: "Level and answer are required",
      });
    }

    const levelKey = String(level);

    // --------------------------------
    // 4. Normalize submitted answer
    // --------------------------------

    const submittedAnswer = String(answer)
      .trim()
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();

    // --------------------------------
    // 5. Read SECRET answer
    // --------------------------------
    //
    // This happens on Vercel.
    // The browser NEVER receives this value.
    //

    const answerSnapshot = await db
      .ref(`/ans/${levelKey}`)
      .once("value");

    const answerData = answerSnapshot.val();

    if (!answerData || !answerData.ans) {
      console.error(`Answer missing for level ${levelKey}`);

      return res.status(404).json({
        error: "Answer not found",
      });
    }

    const correctAnswer = String(answerData.ans)
      .trim()
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();

    // --------------------------------
    // 6. Check answer
    // --------------------------------

    if (submittedAnswer !== correctAnswer) {
      return res.status(200).json({
        correct: false,
      });
    }

    // --------------------------------
    // 7. Check whether level is already completed
    // --------------------------------

    const completedRef = db.ref(`/users/${uid}/${levelKey}`);

    const completionSnapshot = await completedRef.once("value");

    if (completionSnapshot.exists()) {
      return res.status(200).json({
        correct: true,
        alreadyCompleted: true,
      });
    }

    // --------------------------------
    // 8. Mark level completed
    // --------------------------------

    const timestamp = Date.now();

    await completedRef.set(timestamp);

    // --------------------------------
    // 9. Add 100 points
    // --------------------------------

    const pointsRef = db.ref(`/users/${uid}/points`);

    await pointsRef.transaction((currentPoints) => {
      return (Number(currentPoints) || 0) + 100;
    });

    // --------------------------------
    // 10. Update latest timestamp
    // --------------------------------

    await db.ref(`/users/${uid}/latest`).set(timestamp);

    // --------------------------------
    // 11. Return ONLY result
    // --------------------------------

    return res.status(200).json({
      correct: true,
      alreadyCompleted: false,
    });

  } catch (error) {
    console.error("checkAnswer error:", error);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
}