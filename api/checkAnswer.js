import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getAuth } from "firebase-admin/auth";

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
const adminAuth = getAuth();

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    // --------------------------------------------------
    // 1. Get Firebase Authentication token
    // --------------------------------------------------

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    const idToken = authHeader.substring(7);

    // Verify the Firebase user
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    const uid = decodedToken.uid;

    // --------------------------------------------------
    // 2. Get level + submitted answer from browser
    // --------------------------------------------------

    const { level, answer } = req.body || {};

    if (level === undefined || answer === undefined) {
      return res.status(400).json({
        error: "Level and answer are required",
      });
    }

    const levelKey = String(level);

    // --------------------------------------------------
    // 3. Normalize user's submitted answer
    // --------------------------------------------------

    const submittedAnswer = String(answer)
      .trim()
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();

    if (!submittedAnswer) {
      return res.status(400).json({
        error: "Answer cannot be empty",
      });
    }

    // --------------------------------------------------
    // 4. Read SECRET answer from Firebase
    //
    // Firebase structure:
    //
    // ans
    //   └── 1
    //       └── ans: "technocrats"
    //
    // This read happens ONLY on Vercel.
    // The answer is never returned to the browser.
    // --------------------------------------------------

    const answerSnapshot = await db
      .ref(`/ans/${levelKey}`)
      .once("value");

    const answerData = answerSnapshot.val();

    if (!answerData || typeof answerData.ans !== "string") {
      console.error(`Answer not found for level ${levelKey}`);

      return res.status(404).json({
        error: "Answer not found",
      });
    }

    const correctAnswer = answerData.ans
      .trim()
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();

    // --------------------------------------------------
    // 5. Compare answers
    // --------------------------------------------------

    if (submittedAnswer !== correctAnswer) {
      return res.status(200).json({
        correct: false,
      });
    }

    // --------------------------------------------------
    // 6. Check if this level was already completed
    // --------------------------------------------------

    const completedRef = db.ref(`/users/${uid}/${levelKey}`);

    const completionSnapshot = await completedRef.once("value");

    if (completionSnapshot.exists()) {
      return res.status(200).json({
        correct: true,
        alreadyCompleted: true,
      });
    }

    // --------------------------------------------------
    // 7. Return success
    //
    // IMPORTANT:
    // We are NOT updating points here because you asked
    // to keep your existing browser-side points logic.
    // --------------------------------------------------

    return res.status(200).json({
      correct: true,
      alreadyCompleted: false,
    });

  } catch (error) {
    console.error("checkAnswer error:", error);

    // Authentication error
    if (
      error.code === "auth/id-token-expired" ||
      error.code === "auth/argument-error" ||
      error.code === "auth/id-token-revoked"
    ) {
      return res.status(401).json({
        error: "Invalid or expired authentication token",
      });
    }

    return res.status(500).json({
      error: "Internal server error",
    });
  }
}