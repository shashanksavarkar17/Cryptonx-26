export default function handler(req, res) {
  res.status(200).json({
    success: true,
    message: "CryptonX Vercel API is working"
  });
}