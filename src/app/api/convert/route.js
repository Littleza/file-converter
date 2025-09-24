import { NextResponse } from "next/server";
import { FFmpeg } from "@ffmpeg/ffmpeg";

const ffmpeg = new FFmpeg();

export async function POST(req) {
  const formData = await req.formData();
  const file = formData.get("file");
  const format = formData.get("format");

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ffmpeg.loaded) {
    await ffmpeg.load();
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const inputFile = file.name;
  const outputFile = `output.${format}`;

  await ffmpeg.writeFile(inputFile, data);
  await ffmpeg.exec(["-i", inputFile, outputFile]);
  const output = await ffmpeg.readFile(outputFile);

  return new NextResponse(output, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename=converted.${format}`,
    },
  });
}
