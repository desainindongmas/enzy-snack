// Encrypt locally obtained backups. Never connects to a database or uploads data.
import {createReadStream,createWriteStream} from 'node:fs';
import {open,stat,link,unlink} from 'node:fs/promises';
import {createCipheriv,createDecipheriv,pbkdf2,randomBytes} from 'node:crypto';
import {promisify} from 'node:util';
import {pipeline} from 'node:stream/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const derive=promisify(pbkdf2),magic='ENZYBACKUP1\n',iterations=600000;
function checkPassword(password){if(typeof password!=='string'||password.length<12||Buffer.byteLength(password)>1024)throw new Error('Gunakan kata sandi 12 karakter atau lebih (maksimal 1024 byte).')}
async function destination(out){const path=resolve(out);try{await stat(path);throw new Error('Tujuan sudah ada; tidak boleh menimpa file.')}catch(e){if(e.code!=='ENOENT')throw e}return path}
async function finish(temp,out){await link(temp,out);await unlink(temp)}
export async function encryptBackup(input,output,password){
 checkPassword(password);if((await stat(input)).size===0)throw new Error('Berkas backup kosong; ambil backup yang valid terlebih dahulu.');const out=await destination(output),temp=out+'.partial-'+randomBytes(8).toString('hex');let key;
 try{
  const salt=randomBytes(16),iv=randomBytes(12),header=Buffer.from(magic+JSON.stringify({version:1,cipher:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations,salt:salt.toString('hex'),iv:iv.toString('hex')})+'\n');
  key=await derive(password,salt,iterations,32,'sha256');const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(header);
  const file=await open(temp,'wx',0o600);await file.write(header);await file.close();
  await pipeline(createReadStream(input),cipher,createWriteStream(temp,{flags:'a',mode:0o600}));
  const end=await open(temp,'a');await end.write(cipher.getAuthTag());await end.close();await finish(temp,out);
 }catch(e){await unlink(temp).catch(()=>{});throw e}finally{key?.fill(0)}
}
export async function decryptBackup(input,output,password){
 checkPassword(password);const out=await destination(output),temp=out+'.partial-'+randomBytes(8).toString('hex');let key;
 try{
  const file=await open(input,'r');let data,size;try{size=(await file.stat()).size;const b=Buffer.alloc(1024);const r=await file.read(b,0,b.length,0);data=b.subarray(0,r.bytesRead)}finally{await file.close()}
  const second=data.indexOf(10,magic.length);if(!data.subarray(0,magic.length).equals(Buffer.from(magic))||second<0)throw new Error('Format backup tidak didukung.');
  const header=data.subarray(0,second+1),meta=JSON.parse(data.subarray(magic.length,second).toString('utf8'));
  if(meta.version!==1||meta.cipher!=='AES-256-GCM'||meta.kdf!=='PBKDF2-SHA256'||meta.iterations!==iterations||!(/^[a-f0-9]{32}$/).test(meta.salt)||!(/^[a-f0-9]{24}$/).test(meta.iv)||size<=header.length+16)throw new Error('Header backup tidak valid.');
  const tail=await open(input,'r'),tag=Buffer.alloc(16);try{await tail.read(tag,0,16,size-16)}finally{await tail.close()}
  key=await derive(password,Buffer.from(meta.salt,'hex'),iterations,32,'sha256');const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(meta.iv,'hex'));decipher.setAAD(header);decipher.setAuthTag(tag);
  await pipeline(createReadStream(input,{start:header.length,end:size-17}),decipher,createWriteStream(temp,{flags:'wx',mode:0o600}));await finish(temp,out);
 }catch(e){await unlink(temp).catch(()=>{});throw e}finally{key?.fill(0)}
}
async function passwordPrompt(){
 if(!process.stdin.isTTY||!process.stdin.setRawMode)throw new Error('Jalankan pada terminal interaktif agar kata sandi tidak tampil atau masuk riwayat.');
 process.stderr.write('Kata sandi backup (tidak ditampilkan): ');process.stdin.setEncoding('utf8');process.stdin.setRawMode(true);process.stdin.resume();
 return new Promise((resolve,reject)=>{let value='';const cleanup=()=>{process.stdin.off('data',onData);process.stdin.setRawMode(false);process.stdin.pause();process.stderr.write('\n')};function onData(chunk){for(const c of chunk.toString('utf8')){if(c==='\u0003'){cleanup();reject(new Error('Dibatalkan.'));return}if(c==='\r'||c==='\n'){cleanup();resolve(value);return}if(c==='\u007f'||c==='\b')value=value.slice(0,-1);else if(c>=' ')value+=c}}process.stdin.on('data',onData)})
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const [action,input,output]=process.argv.slice(2);if(!['encrypt','decrypt'].includes(action)||!input||!output)throw new Error('Cara pakai: node scripts/backup-crypto.mjs encrypt|decrypt FILE_MASUK FILE_KELUAR');const password=await passwordPrompt();if(action==='encrypt'&&password!==await passwordPrompt())throw new Error('Kedua kata sandi tidak sama.');await (action==='encrypt'?encryptBackup:decryptBackup)(input,output,password);console.log('Selesai. File dibuat tanpa menimpa file lain.')}catch(e){console.error(e.message);process.exitCode=1}
}
