import { transcribeAudioBuffer } from "../services/sttService.js";
import { AppError } from "../utils/errors.js";

export async function transcribeAudioHandler(req, res) {
  const { audioBase64, mimeType = "audio/webm", language = "en-US" } = req.body;

  if (!audioBase64 || typeof audioBase64 !== "string") {
    throw new AppError("audioBase64 string is required", 400);
  }

  // Strip potential data URL prefix (e.g., data:audio/webm;base64,...)
  const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(cleanBase64, "base64");

  if (buffer.length === 0) {
    throw new AppError("Audio data is empty", 400);
  }

  // Max 5MB audio payload safeguard (prevents memory spikes and OOM on container runtimes)
  if (buffer.length > 5 * 1024 * 1024) {
    throw new AppError("Audio file exceeds maximum size limit of 5MB", 400);
  }

  const result = await transcribeAudioBuffer({ buffer, mimeType, language });

  if (!result.success) {
    return res.status(200).json({
      success: false,
      code: result.code || "TRANSCRIPTION_FAILED",
      message: result.message || "Transcription unavailable",
      transcript: "",
    });
  }

  return res.status(200).json({
    success: true,
    transcript: result.transcript,
    provider: result.provider,
  });
}
