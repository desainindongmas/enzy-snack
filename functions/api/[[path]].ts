import {handlePairing,type PairingEnv} from '../../server/pairing-api';
export const onRequest=(context:{request:Request;env:PairingEnv})=>handlePairing(context.request,context.env);
