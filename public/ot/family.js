'use strict';
// Both clients queue trickled ICE until the remote SDP is applied.
window.OTFamilyPeer=class {
 constructor(socket,peer,shareId,config,{stream,onstream,onstate}={}){
  this.socket=socket;this.peer=peer;this.shareId=shareId;this.pending=[];this.closed=false;
  this.pc=new RTCPeerConnection(config);
  if(stream)for(const track of stream.getTracks())this.pc.addTrack(track,stream);
  this.pc.onicecandidate=e=>{if(e.candidate)this.send('candidate',e.candidate.toJSON())};
  this.pc.ontrack=e=>onstream?.(e.streams[0]||new MediaStream([e.track]));
  this.pc.onconnectionstatechange=()=>onstate?.(this.pc.connectionState);
 }
 send(kind,data){if(!this.closed)this.socket.emit('signal',{peer:this.peer,shareId:this.shareId,kind,data})}
 async offer(){await this.pc.setLocalDescription(await this.pc.createOffer());this.send('offer',this.pc.localDescription.toJSON())}
 async receive(kind,data){if(this.closed)return;if(kind==='candidate'){if(this.pc.remoteDescription)await this.pc.addIceCandidate(data);else this.pending.push(data);return}
  await this.pc.setRemoteDescription(data);for(const c of this.pending.splice(0))await this.pc.addIceCandidate(c);
  if(kind==='offer'){await this.pc.setLocalDescription(await this.pc.createAnswer());this.send('answer',this.pc.localDescription.toJSON())}
 }
 close(){this.closed=true;this.pc.onconnectionstatechange=null;this.pc.close();this.pending=[]}
};
