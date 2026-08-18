import { initializeApp, cert, getApps } from "firebase-admin/app";
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


const adminAuth = getAuth();

// Admin email allowed to see real names behind "hide" — mirrors the
// exception previously implemented client-side in leaderboard.html.
const ADMIN_EMAIL = "shashanksavarkar17@gmail.com";

// -------------------------------------------------
// REST-based RTDB read (avoids the Admin SDK's
// WebSocket client, which can hang/stall on cold
// starts in serverless environments)
// -------------------------------------------------
async function readFromRTDB(path) {
  const app = getApps()[0];
  const accessToken = await app.options.credential.getAccessToken();

  const url = `${process.env.FIREBASE_DATABASE_URL}${path}.json`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken.access_token}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`RTDB REST read failed: ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}


// =====================================================
// API HANDLER
// =====================================================

export default async function handler(req, res) {

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {

    // -------------------------------------------------
    // 1. Optional caller identity (leaderboard is public,
    //    but a valid token unlocks "your standing" and,
    //    for the admin account, real names behind "hide")
    // -------------------------------------------------

    let callerUid = null;
    let callerEmail = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const decodedToken = await adminAuth.verifyIdToken(
          authHeader.substring(7)
        );
        callerUid = decodedToken.uid;
        callerEmail = decodedToken.email || null;
      } catch (error) {
        // Invalid/expired token: treat request as anonymous.
      }
    }

    const isAdmin = callerEmail === ADMIN_EMAIL;


    // -------------------------------------------------
    // 2. Read users
    // -------------------------------------------------

    const usersData = await readFromRTDB("/users");

    if (!usersData) {
      return res.status(200).json({
        count: 0,
        standings: [],
        you: null,
      });
    }

    const users = Object.entries(usersData);

    users.sort(function (a, b) {
      if (b[1].points !== a[1].points) {
        return b[1].points - a[1].points;
      } else {
        return (a[1].latest || 0) - (b[1].latest || 0);
      }
    });


    // -------------------------------------------------
    // 3. Build public standings (names redacted per "hide")
    // -------------------------------------------------

    let you = null;

    const standings = users.map(function ([uid, user], index) {
      const rank = index + 1;
      const points = user.points || 0;
      
      // CHANGED: Flexible evaluation for 'hide' data types and handles missing names safely
      const isUserHidden = user.hide == 1 || user.hide === true || !user.name;
      const hidden = isUserHidden && !isAdmin;
      
      // CHANGED: Replaced "Unknown" fallback with "Hidden" if flag conditions match
      const name = hidden ? "Hidden" : (user.name || "Participant");

      if (uid === callerUid) {
        you = { rank, points };
      }

      return { rank, name, points };
    });


    // -------------------------------------------------
    // 4. Return
    // -------------------------------------------------

    return res.status(200).json({
      count: users.length,
      standings,
      you,
    });

  } catch (error) {

    console.error(
      "leaderboard error:",
      error
    );

    return res.status(500).json({
      error: "Internal server error",
    });
  }
}


// import { initializeApp, cert, getApps } from "firebase-admin/app";
// import { getAuth } from "firebase-admin/auth";


// // =====================================================
// // FIREBASE ADMIN INITIALIZATION
// // =====================================================

// if (!getApps().length) {

//   const projectId = process.env.FIREBASE_PROJECT_ID;
//   const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
//   const privateKey = process.env.FIREBASE_PRIVATE_KEY;
//   const databaseURL = process.env.FIREBASE_DATABASE_URL;

//   if (!projectId || !clientEmail || !privateKey || !databaseURL) {
//     throw new Error(
//       "Missing Firebase environment variables"
//     );
//   }

//   initializeApp({
//     credential: cert({
//       projectId,
//       clientEmail,
//       privateKey: privateKey.replace(/\\n/g, "\n"),
//     }),
//     databaseURL,
//   });
// }


// const adminAuth = getAuth();

// // Admin email allowed to see real names behind "hide" — mirrors the
// // exception previously implemented client-side in leaderboard.html.
// const ADMIN_EMAIL = "shashanksavarkar17@gmail.com";

// // -------------------------------------------------
// // REST-based RTDB read (avoids the Admin SDK's
// // WebSocket client, which can hang/stall on cold
// // starts in serverless environments)
// // -------------------------------------------------
// async function readFromRTDB(path) {
//   const app = getApps()[0];
//   const accessToken = await app.options.credential.getAccessToken();

//   const url = `${process.env.FIREBASE_DATABASE_URL}${path}.json`;

//   const controller = new AbortController();
//   const timeout = setTimeout(() => controller.abort(), 8000);

//   try {
//     const response = await fetch(url, {
//       headers: {
//         Authorization: `Bearer ${accessToken.access_token}`,
//       },
//       signal: controller.signal,
//     });

//     if (!response.ok) {
//       throw new Error(`RTDB REST read failed: ${response.status}`);
//     }

//     return await response.json();
//   } finally {
//     clearTimeout(timeout);
//   }
// }


// // =====================================================
// // API HANDLER
// // =====================================================

// export default async function handler(req, res) {

//   if (req.method !== "GET") {
//     return res.status(405).json({
//       error: "Method not allowed",
//     });
//   }

//   try {

//     // -------------------------------------------------
//     // 1. Optional caller identity (leaderboard is public,
//     //    but a valid token unlocks "your standing" and,
//     //    for the admin account, real names behind "hide")
//     // -------------------------------------------------

//     let callerUid = null;
//     let callerEmail = null;

//     const authHeader = req.headers.authorization;
//     if (authHeader && authHeader.startsWith("Bearer ")) {
//       try {
//         const decodedToken = await adminAuth.verifyIdToken(
//           authHeader.substring(7)
//         );
//         callerUid = decodedToken.uid;
//         callerEmail = decodedToken.email || null;
//       } catch (error) {
//         // Invalid/expired token: treat request as anonymous.
//       }
//     }

//     const isAdmin = callerEmail === ADMIN_EMAIL;


//     // -------------------------------------------------
//     // 2. Read users
//     // -------------------------------------------------

//     const usersData = await readFromRTDB("/users");

//     if (!usersData) {
//       return res.status(200).json({
//         count: 0,
//         standings: [],
//         you: null,
//       });
//     }

//     const users = Object.entries(usersData);

//     users.sort(function (a, b) {
//       if (b[1].points !== a[1].points) {
//         return b[1].points - a[1].points;
//       } else {
//         return (a[1].latest || 0) - (b[1].latest || 0);
//       }
//     });


//     // -------------------------------------------------
//     // 3. Build public standings (names redacted per "hide")
//     // -------------------------------------------------

//     let you = null;

//     const standings = users.map(function ([uid, user], index) {
//       const rank = index + 1;
//       const points = user.points || 0;
//       const hidden = user.hide === 1 && !isAdmin;
//       const name = hidden ? "Hidden" : (user.name || "Unknown");

//       if (uid === callerUid) {
//         you = { rank, points };
//       }

//       return { rank, name, points };
//     });


//     // -------------------------------------------------
//     // 4. Return
//     // -------------------------------------------------

//     return res.status(200).json({
//       count: users.length,
//       standings,
//       you,
//     });

//   } catch (error) {

//     console.error(
//       "leaderboard error:",
//       error
//     );

//     return res.status(500).json({
//       error: "Internal server error",
//     });
//   }
// }
