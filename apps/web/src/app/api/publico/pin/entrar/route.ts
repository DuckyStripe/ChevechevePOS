import type { NextRequest } from "next/server";
import { procesarPin } from "@/lib/pin-bff";

export const POST = (req: NextRequest) => procesarPin(req, "entrar");
