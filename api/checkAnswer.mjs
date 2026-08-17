import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getAuth } from "firebase-admin/auth";


// =====================================================
// FIREBASE ADMIN INITIALIZATION
// =====================================================

if (!getApps().length) {

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const databaseURL = process.env.FIREBASE_DATABASE_URL;

  if (!projectId || !clientEmail || !privateKey || !databaseURL) {
    throw new Error(
      "Missing Firebase environment variables"
    );
  }

  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n"),
    }),
    databaseURL,
  });
}


const db = getDatabase();
const adminAuth = getAuth();


// =====================================================
// API HANDLER
// =====================================================

export default async function handler(req, res) {

  // ---------------------------------------------------
  // Only POST requests
  // ---------------------------------------------------

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }


  try {

    // -------------------------------------------------
    // 1. Firebase Authentication
    // -------------------------------------------------

    const authHeader = req.headers.authorization;

    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ")
    ) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }


    const idToken = authHeader.substring(7);

    const decodedToken =
      await adminAuth.verifyIdToken(idToken);

    const uid = decodedToken.uid;


    // -------------------------------------------------
    // 2. Get request data
    // -------------------------------------------------

    const { level, answer } = req.body || {};

    if (
      level === undefined ||
      answer === undefined
    ) {
      return res.status(400).json({
        error: "Level and answer are required",
      });
    }


    const levelKey = String(level);


    // -------------------------------------------------
    // 3. Normalize submitted answer
    // -------------------------------------------------

    const submittedAnswer = String(answer)
      .trim()
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();


    if (!submittedAnswer) {
      return res.status(400).json({
        error: "Answer cannot be empty",
      });
    }


    // -------------------------------------------------
    // 4. Read SECRET answer
    //
    // Firebase:
    //
    // /ans
    //    /1
    //       ans: "technocrats"
    //
    // The browser NEVER performs this read.
    // -------------------------------------------------

    const answerSnapshot = await db
      .ref(`/ans/${levelKey}`)
      .once("value");


    const answerData = answerSnapshot.val();


    if (
      !answerData ||
      typeof answerData.ans !== "string"
    ) {

      console.error(
        `Answer missing for level ${levelKey}`
      );

      return res.status(404).json({
        error: "Answer not found",
      });
    }


    // -------------------------------------------------
    // 5. Normalize stored answer
    // -------------------------------------------------

    const correctAnswer = answerData.ans
      .trim()
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();


    // -------------------------------------------------
    // 6. Compare
    // -------------------------------------------------

    const correct =
      submittedAnswer === correctAnswer;


    console.log(
      `Answer checked for level ${levelKey}`
    );


    // -------------------------------------------------
    // 7. Return ONLY result
    // -------------------------------------------------

    return res.status(200).json({
      correct,
    });

  } catch (error) {

    console.error(
      "checkAnswer error:",
      error
    );

    return res.status(500).json({
      error: "Internal server error",
    });
  }
}