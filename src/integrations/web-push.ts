export interface PushMessage { title:string; body:string; url:string; tag?:string }
export interface PushSubscriptionRecord { endpoint:string; p256dh:string; authKey:string }
export interface WebPushDeliveryAdapter {
  configured():boolean;
  send(subscription:PushSubscriptionRecord,message:PushMessage):Promise<{delivered:boolean;statusCode?:number}>;
}
export class UnconfiguredWebPushAdapter implements WebPushDeliveryAdapter {
  configured(){return false;}
  async send():Promise<{delivered:boolean;statusCode?:number}>{throw new Error("web_push_not_configured");}
}
