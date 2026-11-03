import "./style.css";
import * as THREE from "three";
import { io } from "socket.io-client";

const socket = io({ autoConnect: true });
const $ = id => document.getElementById(id);
const menu = $("menu"), lobby = $("lobby"), gameUI = $("gameUI"), endScreen = $("endScreen");
let room = null, isHost = false, myRole = "survivor", players = new Map(), phase = "menu";
let scene, camera, renderer, clock, world, localAvatar, cameraMode = 3;
let yaw = 0, pitch = -0.18, move = {x:0,z:0}, lastSend = 0, attackReady = true;
let generatorMeshes = [], toastTimer;

function showToast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}
function showScreen(which) {
  menu.classList.toggle("hidden", which !== "menu");
  lobby.classList.toggle("hidden", which !== "lobby");
  endScreen.classList.toggle("hidden", which !== "end");
  gameUI.classList.toggle("hidden", which !== "game");
}
function playerName() { return $("playerName").value.trim().slice(0,16) || "ÐÐ³ÑÐ¾Ðº"; }
function error(id, message) { $(id).textContent = message || ""; }

$("createBtn").onclick = () => {
  error("menuError", "");
  socket.emit("room:create", {name:playerName()}, result => {
    if (!result?.ok) return error("menuError", result?.error || "ÐÐµ ÑÐ´Ð°Ð»Ð¾ÑÑ ÑÐ¾Ð·Ð´Ð°ÑÑ ÐºÐ¾Ð¼Ð½Ð°ÑÑ.");
    enterLobby(result);
  });
};
$("joinBtn").onclick = () => {
  error("menuError", "");
  socket.emit("room:join", {code:$("roomCode").value, name:playerName()}, result => {
    if (!result?.ok) return error("menuError", result?.error || "ÐÐµ ÑÐ´Ð°Ð»Ð¾ÑÑ Ð²Ð¾Ð¹ÑÐ¸.");
    enterLobby(result);
  });
};
function enterLobby(result) {
  room = result.room; isHost = result.host; phase = "lobby";
  $("lobbyCode").textContent = room.code;
  $("startBtn").style.display = isHost ? "block" : "none";
  $("hostHint").textContent = isHost ? "Ð¢Ñ ÑÐ¾Ð·Ð´Ð°ÑÐµÐ»Ñ ÐºÐ¾Ð¼Ð½Ð°ÑÑ. ÐÑÐ¸Ð³Ð»Ð°ÑÐ¸ Ð´ÑÑÐ·ÐµÐ¹ Ð¿Ð¾ ID." : "ÐÐ¶Ð¸Ð´Ð°Ð½Ð¸Ðµ Ð·Ð°Ð¿ÑÑÐºÐ° Ð¼Ð°ÑÑÐ° ÑÐ¾Ð·Ð´Ð°ÑÐµÐ»ÐµÐ¼ ÐºÐ¾Ð¼Ð½Ð°ÑÑ.";
  renderPlayers(room); showScreen("lobby");
}
function renderPlayers(data) {
  room = data;
  $("lobbyCode").textContent = data.code;
  $("playerList").innerHTML = data.players.map((p,i)=>`<div class="player"><span>${i+1}. ${escapeHtml(p.name)}</span><span>${p.id===socket.id?"Ð¢Ð«": "Ð ÐÐÐÐÐÐ¢Ð"}</span></div>`).join("");
  $("hostHint").textContent = `${data.players.length}/6 Ð¸Ð³ÑÐ¾ÐºÐ¾Ð² Â· ${isHost ? "Ð¢Ñ ÑÐ¾Ð·Ð´Ð°ÑÐµÐ»Ñ ÐºÐ¾Ð¼Ð½Ð°ÑÑ" : "ÐÐ¶Ð¸Ð´Ð°ÐµÐ¼ ÑÐ¾ÑÑÐ°"}`;
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function updateRoster(data) {
  // Keep the latest server-side player status; the active scene uses socket IDs
  // to identify remote avatars and elimination events.
  room = data;
  const me = data.players.find(p => p.id === socket.id);
  if (me && me.role) {
    myRole = me.role;
    $("roleLabel").textContent = myRole === "killer" ? "ÐÐÐÐ¬Ð¯Ð" : "ÐÐ«ÐÐÐÐ¨ÐÐ";
    $("actionBtn").textContent = myRole === "killer" ? "Ð£ÐÐÐ " : "Ð§ÐÐÐÐ¢Ð¬";
  }
}
$("copyBtn").onclick = async () => { try { await navigator.clipboard.writeText(room.code); showLobbyHint("ID ÑÐºÐ¾Ð¿Ð¸ÑÐ¾Ð²Ð°Ð½!"); } catch { showLobbyHint("ID ÐºÐ¾Ð¼Ð½Ð°ÑÑ: "+room.code); } };
function showLobbyHint(t){$("hostHint").textContent=t;}
$("startBtn").onclick = () => socket.emit("match:start", {}, r => { if(!r?.ok) error("lobbyError",r?.error); });
$("leaveBtn").onclick = () => { socket.disconnect(); socket.connect(); room=null; showScreen("menu"); };
$("backBtn").onclick = () => { socket.disconnect(); socket.connect(); room=null; phase="menu"; disposeWorld(); showScreen("menu"); };
$("returnBtn").onclick = () => { socket.disconnect(); socket.connect(); room=null; phase="menu"; disposeWorld(); showScreen("menu"); };

socket.on("room:update", data => {
  if (room && data.code === room.code && phase === "lobby") renderPlayers(data);
  if (room && data.code === room.code && phase === "game") updateRoster(data);
});
socket.on("match:started", data => {
  room = data; phase="game";
  const me = data.players.find(p=>p.id===socket.id);
  myRole = me?.role || "survivor";
  $("roleLabel").textContent = myRole === "killer" ? "ÐÐÐÐ¬Ð¯Ð" : "ÐÐ«ÐÐÐÐ¨ÐÐ";
  $("actionBtn").textContent = myRole === "killer" ? "Ð£ÐÐÐ " : "Ð§ÐÐÐÐ¢Ð¬";
  $("objective").textContent = "ÐÐµÐ½ÐµÑÐ°ÑÐ¾ÑÑ: 0/3";
  showScreen("game"); buildWorld(data);
  showToast(myRole === "killer" ? "ÐÐ°Ð¹Ð´Ð¸ Ð²ÑÐ¶Ð¸Ð²ÑÐ¸Ñ. Ð£Ð´Ð°Ñ â ÐºÐ½Ð¾Ð¿ÐºÐ° ÑÐ¿ÑÐ°Ð²Ð°." : "ÐÐ°Ð¹Ð´Ð¸ Ð³ÐµÐ½ÐµÑÐ°ÑÐ¾ÑÑ Ð¸ Ð°ÐºÑÐ¸Ð²Ð¸ÑÑÐ¹ 3.");
});
socket.on("player:moved", data => {
  const p = players.get(data.id); if (p) { p.target.set(data.x,0,data.z); p.yaw=data.yaw; }
});
socket.on("objective:update", data => { $("objective").textContent = `ÐÐµÐ½ÐµÑÐ°ÑÐ¾ÑÑ: ${data.generators}/${data.needed}`; showToast(`ÐÐµÐ½ÐµÑÐ°ÑÐ¾Ñ Ð°ÐºÑÐ¸Ð²Ð¸ÑÐ¾Ð²Ð°Ð½: ${data.generators}/${data.needed}`); });
socket.on("player:eliminated", data => {
  const p=players.get(data.id); if(p){p.alive=false;p.mesh.visible=false;}
  showToast(data.id===socket.id ? "Ð¢ÐµÐ±Ñ Ð¿Ð¾Ð¹Ð¼Ð°Ð»Ð¸. Ð¢Ñ Ð²ÑÐ±ÑÐ»." : "ÐÐ´Ð¸Ð½ Ð¸Ð· Ð²ÑÐ¶Ð¸Ð²ÑÐ¸Ñ Ð¿Ð¾Ð¹Ð¼Ð°Ð½.");
});
socket.on("match:ended", data => {
  phase="end"; $("endTitle").textContent = data.winner==="killer" ? "ÐÐÐÐ¬Ð¯Ð ÐÐÐÐÐÐÐ" : "ÐÐ«ÐÐÐÐ¨ÐÐ ÐÐÐÐÐÐÐÐ";
  $("endMessage").textContent=data.message; showScreen("end");
});
socket.on("disconnect",()=>{if(phase==="game"||phase==="lobby")showToast("Ð¡Ð¾ÐµÐ´Ð¸Ð½ÐµÐ½Ð¸Ðµ Ð¿Ð¾ÑÐµÑÑÐ½Ð¾. ÐÐµÑÐµÐ¿Ð¾Ð´ÐºÐ»ÑÑÐµÐ½Ð¸Ðµâ¦");});

function buildWorld(data) {
  disposeWorld();
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x101b18); scene.fog = new THREE.FogExp2(0x101b18,0.018);
  camera = new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.1,180);
  renderer = new THREE.WebGLRenderer({antialias:false,powerPreference:"high-performance"});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)); renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=false; renderer.outputColorSpace=THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);
  clock = new THREE.Clock();
  scene.add(new THREE.HemisphereLight(0x9bb6a6,0x1b2019,1.8));
  const moon = new THREE.DirectionalLight(0xc5d5d0,1.15); moon.position.set(-15,25,8); scene.add(moon);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(110,110),new THREE.MeshStandardMaterial({color:0x26352b,roughness:1}));
  ground.rotation.x=-Math.PI/2; ground.position.y=-.05; scene.add(ground);
  // Camp perimeter and paths
  const pathMat=new THREE.MeshStandardMaterial({color:0x5a5746});
  const path=new THREE.Mesh(new THREE.PlaneGeometry(9,85),pathMat);path.rotation.x=-Math.PI/2;path.position.set(0,.005,0);scene.add(path);
  const cabinMat=new THREE.MeshStandardMaterial({color:0x51483a,roughness:1});
  for(let i=0;i<5;i++){const z=-30+i*15; makeCabin(-13,z,cabinMat); makeCabin(13,z+6,cabinMat);}
  const treeMat=new THREE.MeshStandardMaterial({color:0x183126});
  const trunkMat=new THREE.MeshStandardMaterial({color:0x3b3025});
  for(let i=0;i<115;i++){
    const x=(Math.random()-.5)*100,z=(Math.random()-.5)*100;
    if(Math.abs(x)<19 && Math.abs(z)<39) continue;
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.18,.28,2.3,5),trunkMat);trunk.position.set(x,1.15,z);scene.add(trunk);
    const crown=new THREE.Mesh(new THREE.ConeGeometry(1.5,4.5,6),treeMat);crown.position.set(x,4,z);scene.add(crown);
  }
  // campfire / lights
  const fire=new THREE.PointLight(0xff8a43,8,15);fire.position.set(0,2,-8);scene.add(fire);
  const fireBase=new THREE.Mesh(new THREE.CylinderGeometry(.65,.8,.35,8),new THREE.MeshStandardMaterial({color:0x30261c}));fireBase.position.set(0,.2,-8);scene.add(fireBase);
  // generator objectives
  generatorMeshes=[];
  [[-15,-15],[15,16],[0,34]].forEach((pos,i)=>{
    const group=new THREE.Group(); group.position.set(pos[0],0,pos[1]);
    const body=new THREE.Mesh(new THREE.BoxGeometry(1.1,1.25,.75),new THREE.MeshStandardMaterial({color:0x4b5550,metalness:.45,roughness:.7}));body.position.y=.65;group.add(body);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.13,8,8),new THREE.MeshBasicMaterial({color:0xffc45c}));lamp.position.set(0,1.4,.4);group.add(lamp);
    scene.add(group);generatorMeshes.push(group);
  });
  // Spawn player avatars
  players.clear();
  data.players.forEach(p=>{
    const mesh=makeAvatar(p.role,p.id===socket.id);
    scene.add(mesh);
    players.set(p.id,{mesh,target:new THREE.Vector3(p.x,0,p.z),yaw:0,alive:p.alive,role:p.role});
    if(p.id===socket.id){localAvatar=players.get(p.id);localAvatar.mesh.position.set(p.x,0,p.z);}
  });
  yaw=0; pitch=-.18; cameraMode=3;
  updateCamera();
  animate();
}
function makeCabin(x,z,mat){
  const g=new THREE.Group();g.position.set(x,0,z);
  const base=new THREE.Mesh(new THREE.BoxGeometry(7,3.4,6),mat);base.position.y=1.7;g.add(base);
  const roof=new THREE.Mesh(new THREE.ConeGeometry(5.4,2.8,4),new THREE.MeshStandardMaterial({color:0x292d29}));roof.rotation.y=Math.PI/4;roof.position.y=4.6;g.add(roof);
  const door=new THREE.Mesh(new THREE.BoxGeometry(1.2,2.3,.12),new THREE.MeshStandardMaterial({color:0x211d18}));door.position.set(0,1.15,3.06);g.add(door);scene.add(g);
}
function makeAvatar(role,isMe){
  const group=new THREE.Group();
  const color=role==="killer"?0x272b29:(isMe?0x91a8a0:0x9c8569);
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.38,.85,4,7),new THREE.MeshStandardMaterial({color,roughness:1}));body.position.y=.95;group.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.28,8,8),new THREE.MeshStandardMaterial({color:role==="killer"?0xc6c4b7:0xc69b78}));head.position.y=1.75;group.add(head);
  if(role==="killer"){
    const mask=new THREE.Mesh(new THREE.SphereGeometry(.285,8,8),new THREE.MeshStandardMaterial({color:0xd7d4c4}));mask.scale.set(.95,1,.35);mask.position.set(0,1.76,.22);group.add(mask);
    const eyeMat=new THREE.MeshBasicMaterial({color:0x090909});
    [-.1,.1].forEach(x=>{const eye=new THREE.Mesh(new THREE.SphereGeometry(.035,6,6),eyeMat);eye.position.set(x,1.79,.33);group.add(eye);});
  }
  return group;
}
function updateCamera(){
  if(!localAvatar)return;
  const pos=localAvatar.mesh.position;
  if(cameraMode===1){
    camera.position.set(pos.x,pos.y+1.62,pos.z);
    camera.rotation.order="YXZ";camera.rotation.y=yaw;camera.rotation.x=pitch;
  } else {
    const distance=5.5, height=2.4;
    const target=new THREE.Vector3(pos.x,pos.y+1.35,pos.z);
    const offset=new THREE.Vector3(Math.sin(yaw)*distance, height-pitch*2, Math.cos(yaw)*distance);
    camera.position.copy(target).add(offset);camera.lookAt(target);
  }
}
function animate(){
  if(!renderer || phase!=="game")return;
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.05);
  const me=localAvatar;
  if(me?.alive){
    const speed=myRole==="killer"?4.1:4.7;
    const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
    const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
    const delta=forward.multiplyScalar(-move.z).add(right.multiplyScalar(move.x));
    if(delta.lengthSq()>0){delta.normalize().multiplyScalar(speed*dt);me.mesh.position.add(delta);me.mesh.position.x=THREE.MathUtils.clamp(me.mesh.position.x,-48,48);me.mesh.position.z=THREE.MathUtils.clamp(me.mesh.position.z,-48,48);me.mesh.rotation.y=yaw;}
    const now=performance.now();
    if(now-lastSend>60){socket.emit("player:move",{x:me.mesh.position.x,z:me.mesh.position.z,yaw});lastSend=now;}
  }
  for(const [id,p] of players){if(id!==socket.id && p.alive){p.mesh.position.lerp(p.target,Math.min(1,dt*9));p.mesh.rotation.y=p.yaw;}}
  updateCamera();renderer.render(scene,camera);
}
function disposeWorld(){if(renderer){renderer.dispose();renderer.domElement.remove();renderer=null;}scene=null;localAvatar=null;players.clear();generatorMeshes=[];}
$("cameraBtn").onclick=()=>{cameraMode=cameraMode===1?3:1;showToast(cameraMode===1?"ÐÐ¸Ð´ Ð¾Ñ Ð¿ÐµÑÐ²Ð¾Ð³Ð¾ Ð»Ð¸ÑÐ°":"ÐÐ¸Ð´ Ð¾Ñ ÑÑÐµÑÑÐµÐ³Ð¾ Ð»Ð¸ÑÐ°");};
$("actionBtn").onclick=()=>{
  if(myRole==="killer"){socket.emit("killer:attack",{},r=>{if(!r?.ok)showToast(r?.error||"ÐÑÐ¾Ð¼Ð°Ñ");else showToast("Ð£Ð´Ð°Ñ Ð½Ð°Ð½ÐµÑÑÐ½!");});}
  else {
    if(!localAvatar)return;
    let nearest=null,best=4.2;
    for(const g of generatorMeshes){const d=localAvatar.mesh.position.distanceTo(g.position);if(d<best){best=d;nearest=g;}}
    if(!nearest)return showToast("ÐÐ¾Ð´Ð¾Ð¹Ð´Ð¸ Ð±Ð»Ð¸Ð¶Ðµ Ðº Ð³ÐµÐ½ÐµÑÐ°ÑÐ¾ÑÑ.");
    socket.emit("generator:repair",{},r=>{if(!r?.ok)showToast(r?.error||"ÐÐµ ÑÐ´Ð°Ð»Ð¾ÑÑ Ð¿Ð¾ÑÐ¸Ð½Ð¸ÑÑ.");});
  }
};
// Mobile joystick
const joy=$("joystick"),stick=$("stick");let joyPointer=null;
function setJoy(e){const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=e.clientX-cx,dy=e.clientY-cy;const max=36,len=Math.hypot(dx,dy)||1;if(len>max){dx=dx/len*max;dy=dy/len*max;}stick.style.transform=`translate(${dx}px,${dy}px)`;move.x=dx/max;move.z=dy/max;}
joy.addEventListener("pointerdown",e=>{joyPointer=e.pointerId;joy.setPointerCapture(e.pointerId);setJoy(e);});
joy.addEventListener("pointermove",e=>{if(e.pointerId===joyPointer)setJoy(e);});
function resetJoy(){joyPointer=null;move={x:0,z:0};stick.style.transform="translate(0,0)";}
joy.addEventListener("pointerup",resetJoy);joy.addEventListener("pointercancel",resetJoy);
// Right-side drag rotates camera; on desktop use mouse drag.
let lookPointer=null,lastX=0,lastY=0;
rendererLookSetup();
function rendererLookSetup(){
  document.addEventListener("pointerdown",e=>{if(phase!=="game"||e.clientX<innerWidth*.42||e.target.closest("button")||e.target.closest("#joystick"))return;lookPointer=e.pointerId;lastX=e.clientX;lastY=e.clientY;});
  document.addEventListener("pointermove",e=>{if(e.pointerId!==lookPointer)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;yaw-=dx*.006;pitch=THREE.MathUtils.clamp(pitch-dy*.004,-.8,.45);});
  document.addEventListener("pointerup",e=>{if(e.pointerId===lookPointer)lookPointer=null;});
  addEventListener("resize",()=>{if(camera&&renderer){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}});
}
$("loading").classList.add("done");
