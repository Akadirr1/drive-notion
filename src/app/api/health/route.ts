import { NextResponse } from "next/server";
import { getReaderDb } from "@/server/db/client";
import { getHealth } from "@/server/queries/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getReaderDb();
  const health = getHealth(db);
  return NextResponse.json(health, { status: 200 });
}
