import { NextResponse } from "next/server";
import { SupabaseSystemRepository } from "@/data/supabase/supabase-system-repository";
import { authenticateReadRequest } from "@/data/supabase/request-auth";
import { systemActionSchema } from "@/features/system/system-schema";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store, private"};
export async function GET(request:Request){const auth=await authenticateReadRequest(request);if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401,headers});try{return NextResponse.json({data:await new SupabaseSystemRepository(auth.client,auth.user.id).load()},{headers});}catch{return NextResponse.json({error:"System data is not ready. Apply the latest migration."},{status:503,headers});}}
export async function POST(request:Request){const auth=await authenticateReadRequest(request);if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401,headers});const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return NextResponse.json({error:"Invalid origin"},{status:403,headers});try{const input=systemActionSchema.parse(await request.json());const result=await new SupabaseSystemRepository(auth.client,auth.user.id).act(input);return NextResponse.json({data:result},{headers});}catch{return NextResponse.json({error:"The requested system action was rejected."},{status:400,headers});}}
