// Deliberately unconditional. Phase 2 must replace this only after security gates pass.
export function denyPairing(_request: Request): Response {
 return new Response(JSON.stringify({error:'PAIRING_NOT_ENABLED'}),{
 status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
 });
}
