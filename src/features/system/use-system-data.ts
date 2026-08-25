"use client";
import { useCallback,useEffect,useState } from "react";
import type { SystemSnapshot } from "@/domain/system-models";

export function useSystemData(){
  const[data,setData]=useState<SystemSnapshot|null>(null);const[error,setError]=useState("");const[saving,setSaving]=useState(false);
  const load=useCallback(async()=>{const response=await fetch("/api/product/system",{cache:"no-store"});if(!response.ok)throw new Error("System intelligence is unavailable until its migration is applied.");const body=await response.json()as{data:SystemSnapshot};return body.data;},[]);
  useEffect(()=>{let active=true;load().then((value)=>{if(active)setData(value);}).catch((reason:Error)=>{if(active)setError(reason.message);});return()=>{active=false;};},[load]);
  async function act(action:string,payload:Record<string,unknown>,expectedVersion?:number){setSaving(true);setError("");try{const response=await fetch("/api/product/system",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,payload,...(expectedVersion?{expected_version:expectedVersion}:{}),idempotency_key:crypto.randomUUID()})});if(!response.ok)throw new Error("The change was rejected.");setData(await load());}catch(reason){setError(reason instanceof Error?reason.message:"The change failed.");}finally{setSaving(false);}}
  return{data,error,saving,act};
}
