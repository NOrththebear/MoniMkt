import{a as G,b as H}from"./chunk-ZCRYLQPU.js";import{B as q,C as M,D as C,E as w,I as J,J as U,K as D,L as K,O as j,Q as v,S as z,T as F,U as V,t as g,u as $,v as h}from"./chunk-EUH5NVIN.js";import{sc as T,xd as d}from"./chunk-FA4H73TJ.js";import{g as x}from"./chunk-ZW5JGWQ4.js";import{d as S}from"./chunk-WNOSTPIG.js";import"./chunk-VKPFWVMF.js";import"./chunk-2T33ZYIX.js";import"./chunk-PFQWQSIV.js";var W=h`<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
  <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
  <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
  <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
  <path d="M7 12h10"></path>
</svg>`;var Y=Object.defineProperty,B=(t,e)=>{let r={};for(var n in t)Y(r,n,{get:t[n],enumerable:!0});return e||Y(r,Symbol.toStringTag,{value:"Module"}),r};async function ee(t,e,r){let n=(await t.peerStore.get(e)).addresses.flatMap(({multiaddr:i})=>{let o=ge(i,e);return o?[o]:[]});if(n.length!==0)return r?t.dial(n,{signal:r}):t.dial(n)}function ge(t,e){let r=t.getComponents().at(-1);return r?.name==="p2p"?r.value===e.toString()?t:void 0:t.encapsulate(`/p2p/${e.toString()}`)}var te=class{constructor(t,e){this.components=t,this.config=e,this.errorListeners=new Set;let r=e.maxMessageLength??1048576;if(!Number.isSafeInteger(r)||r<=0)throw Error("Maximum JSON-RPC message length must be a positive integer");this.maxMessageLength=r;let n=e.timeout??3e4;if(!Number.isSafeInteger(n)||n<=0)throw Error("JSON-RPC request timeout must be a positive integer");this.timeout=n}onError(t){return this.errorListeners.add(t),()=>this.errorListeners.delete(t)}async start(){await this.components.registrar.handle(this.config.protocol,this.handleProtocol.bind(this),{runOnLimitedConnection:!0})}async stop(){await this.components.registrar.unhandle(this.config.protocol)}async handleProtocol(t,e){let r=!1,n=new AbortController,i=AbortSignal.timeout(this.timeout),o=s=>{r=!0;let c=Error(s.error?.message??"JSON-RPC stream closed");c.name="AbortError",n.abort(c)},a=()=>{r=!0;let s=be(i,"JSON-RPC request timed out");n.abort(s),t.abort(s)};t.addEventListener("close",o,{once:!0}),i.addEventListener("abort",a,{once:!0}),t.status!=="open"&&o({});try{let s=S(t,{maxDataLength:this.maxMessageLength}),c=fe(d.bytesTo((await s.read({signal:n.signal})).subarray(),"utf8")),p;try{n.signal.throwIfAborted(),p={jsonrpc:"2.0",id:c.id,result:await Promise.race([Promise.resolve(this.handleRequest({connection:e,peerId:e.remotePeer,payload:c,signal:n.signal})),d.abortSignalToPromise(n.signal)])}}catch(l){r||(r=we(l));let E=me(l);p={jsonrpc:"2.0",id:c.id,error:{code:E.code,message:E.message,data:E.data}}}await s.write(d.bytesFrom(JSON.stringify(p),"utf8"),{signal:n.signal}),t.removeEventListener("close",o),await t.close({signal:n.signal})}catch(s){if(r)return;this.handleError(s,t)}finally{t.removeEventListener("close",o),i.removeEventListener("abort",a)}}handleError(t,e){let r=re(t);return e?.abort(r),this.errorListeners.forEach(n=>n(r)),r}};function me(t){return t instanceof T?t:new T({code:-32603,message:re(t).message})}function fe(t){let e=JSON.parse(t);if(e?.jsonrpc!=="2.0"||typeof e.id!="number"&&typeof e.id!="string"||typeof e.method!="string")throw Error("Invalid JSON-RPC request");return e}function re(t){return t instanceof Error?t:Error("JSON-RPC request failed")}function be(t,e){return t.reason instanceof Error?t.reason:Error(e)}function we(t){return t instanceof Error&&(t.name==="AbortError"||t.name==="TimeoutError")}function ve(t,e){return r=>new class extends te{handleRequest(n){return e.call(this,n)}}(r,t)}var ye=class{constructor(t,e,r){this.node=t,this.peerId=e,this.config=r;let n=r.maxMessageLength??1048576;if(!Number.isSafeInteger(n)||n<=0)throw Error("Maximum JSON-RPC message length must be a positive integer");this.maxMessageLength=n;let i=r.timeout??3e4;if(!Number.isSafeInteger(i)||i<=0)throw Error("JSON-RPC request timeout must be a positive integer");this.timeout=i}async request(t,e){let r=AbortSignal.timeout(e?.timeout??this.timeout),n=[this.config.signal,e?.signal,r].filter(s=>s!==void 0),i=d.abortSignalAny(n),o,a;try{o=await this.openStream(i);let s=S(o,{maxDataLength:this.maxMessageLength});await s.write(d.bytesFrom(JSON.stringify(t),"utf8"),{signal:i}),await o.close({signal:i}),a=JSON.parse(d.bytesTo((await s.read({signal:i})).subarray(),"utf8")),await o.closeRead({signal:i}),i.throwIfAborted()}catch(s){let c=Se(s);throw o?.abort(c),c}return this.config.onResponse?.(a),a}async openStream(t){ee(this.node,this.peerId).catch(()=>{});for(let e of this.connections())try{return await e.newStream(this.config.protocol,{runOnLimitedConnection:!0,signal:t})}catch{t.throwIfAborted()}return this.node.dialProtocol(this.peerId,this.config.protocol,{runOnLimitedConnection:!0,signal:t})}connections(){return this.node.getConnections(this.peerId).filter(({status:t})=>t==="open").sort(Ee)}};function Ee(t,e){return t.direct===e.direct?t.rtt===void 0?e.rtt===void 0?0:1:e.rtt===void 0?-1:t.rtt-e.rtt:t.direct?-1:1}function Se(t){return t instanceof Error?t:Error("JSON-RPC request failed")}var N=16384,Pe=["addresses","role","secret"],P=class extends Error{constructor(t,e){super(t,e),this.name="PairingEndpointError"}},ne=class extends P{constructor(t,e){super(`Expected a ${t} pairing endpoint, received ${e?`role "${e}"`:"an endpoint without a role"}`),this.expectedRole=t,this.actualRole=e,this.name="PairingEndpointRoleError"}};async function Ce(t,e,r,n){if(e.length===0)throw Error("Pairing endpoint requires at least one address");if(e.length>16)throw Error("Pairing endpoint supports at most 16 addresses");let i=Ae(e);if(i.byteLength>N)throw Error("Pairing endpoint address data is too large");let o=await oe(i,new CompressionStream("deflate")),a=d.bytesTo(o,"base64url"),s=new URL(t),{params:c,route:p}=ie(s);return Pe.forEach(l=>{c.delete(l)}),n&&c.set("role",n),c.set("addresses",a),c.set("secret",r),s.hash=`${p}?${c.toString()}`,s.toString()}async function Re(t,e){let r;try{r=new URL(t.trim())}catch(a){throw new P("Pairing endpoint is not a valid URL",{cause:a})}let{params:n}=ie(r);if(e){let a=n.get("role")?.trim()||void 0;if(a!==e)throw new ne(e,a)}let i=n.get("addresses")?.trim(),o=n.get("secret")?.trim();if(!i||!o)throw new P("Pairing endpoint is incomplete");return{addresses:await Oe(i),secret:o}}function ie(t){let e=t.hash.slice(1),r=e.indexOf("?");return r===-1?{params:new URLSearchParams,route:e}:{params:new URLSearchParams(e.slice(r+1)),route:e.slice(0,r)}}function Ae(t){return d.bytesConcat(...G(t.map(e=>e.bytes)))}async function Oe(t){try{let e=await oe(d.bytesFrom(t,"base64url"),new DecompressionStream("deflate"),N),r=[];for(let n of H([e],{maxDataLength:N})){if(r.length>=16)throw Error("Too many addresses");r.push(x(n.subarray()))}if(r.length===0)throw Error("Missing addresses");return r}catch(e){throw new P("Pairing endpoint contains invalid compressed addresses",{cause:e})}}async function oe(t,e,r){let n=r===void 0?e.readable:e.readable.pipeThrough(Le(r)),i=new Response(n).arrayBuffer().then(s=>({buffer:s,ok:!0}),s=>({error:s,ok:!1})),o=e.writable.getWriter();try{await o.write(Uint8Array.from(t)),await o.close()}catch(s){let c=await i;throw c.ok?s:c.error}let a=await i;if(!a.ok)throw a.error;return new Uint8Array(a.buffer)}function Le(t){let e=0;return new TransformStream({transform(r,n){if(r.byteLength>t-e)throw Error("Decompressed address data is too large");e+=r.byteLength,n.enqueue(r)}})}var I=1024,se=class{constructor(t,e){if(this.components=t,this.config=e,this.currentSecret=Z(),this.errorListeners=new Set,this.pairedListeners=new Set,this.unpairedListeners=new Set,this.secretChangedListeners=new Set,this.pairingTimeouts=new Map,e.pairedPeerTimeoutMs<=0)throw Error("Paired peer timeout must be greater than zero")}get secret(){return this.currentSecret}onError(t){return this.errorListeners.add(t),()=>this.errorListeners.delete(t)}onPaired(t){return this.pairedListeners.add(t),()=>this.pairedListeners.delete(t)}onUnpaired(t){return this.unpairedListeners.add(t),()=>this.unpairedListeners.delete(t)}onSecretChanged(t){return this.secretChangedListeners.add(t),()=>this.secretChangedListeners.delete(t)}async start(){await this.components.registrar.handle(this.config.protocol,this.handleProtocol.bind(this),{runOnLimitedConnection:!0})}async stop(){await this.components.registrar.unhandle(this.config.protocol),this.pairingTimeouts.forEach(t=>clearTimeout(t)),this.pairingTimeouts.clear()}isPaired(t){return this.pairingTimeouts.has(t.toString())}refresh(t){let e=t.toString(),r=this.pairingTimeouts.get(e);r!==void 0&&(clearTimeout(r),this.pairingTimeouts.set(e,this.createPeerTimeout(t)))}async pair(t,e={}){let r,n;try{let i=await this.openStream(t.addresses,e);if(r=i.stream,!i.connection)throw Error("Could not determine remote peer");this.addPairedPeer(i.connection.remotePeer)&&(n=i.connection.remotePeer);let o=await Q(r,xe(t.secret,this.config.name),e);if(e.signal?.throwIfAborted(),r=void 0,!o.ok)throw Error(o.error);return n&&(this.rotateSecret(),this.notifyPairedPeer(n,o.name)),i.connection.remotePeer}catch(i){throw n&&this.removePairedPeer(n,!1),this.handleError(i,r)}}async unpair(t){if(!this.removePairedPeer(t))return;let e={signal:AbortSignal.timeout(1e4)},r;try{let n=await this.openStream(t,e);r=n.stream;let i=await Q(n.stream,{type:"unpair"},e);if(r=void 0,!i.ok)throw Error(i.error)}catch(n){this.handleError(n,r)}}async handleProtocol(t,e){let r;try{let n=S(t,{maxDataLength:I}),i=ke((await n.read()).subarray());if(i.type==="unpair"){this.removePairedPeer(e.remotePeer),await k(n,t,{ok:!0});return}if(i.secret!==this.secret||!this.canPair(e.remotePeer)){await k(n,t,{ok:!1,error:"Pairing rejected"});return}this.rotateSecret(),this.addPairedPeer(e.remotePeer)&&(r=e.remotePeer),await k(n,t,{ok:!0,name:this.config.name}),r&&this.notifyPairedPeer(r,i.name)}catch(n){r&&this.removePairedPeer(r,!1),this.handleError(n,t)}}addPairedPeer(t){let e=t.toString(),r=this.pairingTimeouts.get(e);return r!==void 0&&clearTimeout(r),this.pairingTimeouts.set(e,this.createPeerTimeout(t)),r===void 0}notifyPairedPeer(t,e){this.pairedListeners.forEach(r=>r(t,e))}rotateSecret(){this.currentSecret=Z(),this.secretChangedListeners.forEach(t=>t(this.currentSecret))}removePairedPeer(t,e=!0){let r=t.toString(),n=this.pairingTimeouts.get(r);return n!==void 0&&(clearTimeout(n),this.pairingTimeouts.delete(r),e&&this.unpairedListeners.forEach(i=>i(t)),!0)}createPeerTimeout(t){return setTimeout(()=>{if(this.components.connectionManager.getConnections(t).some(({status:e})=>e==="open")){this.pairingTimeouts.set(t.toString(),this.createPeerTimeout(t));return}this.removePairedPeer(t)},this.config.pairedPeerTimeoutMs)}async openStream(t,e){let r;return{stream:await this.components.connectionManager.openStream(t,this.config.protocol,{runOnLimitedConnection:!0,signal:e.signal,onProgress(n){n.type==="connection:opened-stream"&&(r=n.detail.connection)}}),connection:r}}handleError(t,e){let r=Ie(t,"Pairing operation failed");return e?.abort(r),this.errorListeners.forEach(n=>n(r)),r}};function Te(t,e){return r=>new class extends se{canPair(n){return e.call(this,n)}}(r,t)}async function Q(t,e,r){let n=S(t,{maxDataLength:I});await n.write(d.bytesFrom(JSON.stringify(e),"utf8"),{signal:r.signal}),await t.close(r);let i=Ne((await n.read(r)).subarray());return await t.closeRead(r),i}function xe(t,e){let r={type:"pair",secret:t,name:e};if(X(r)||delete r.name,!X(r))throw Error("Pairing request is too large");return r}function X(t){return d.bytesFrom(JSON.stringify(t),"utf8").byteLength<=I}async function k(t,e,r){await t.write(d.bytesFrom(JSON.stringify(r),"utf8")),await e.close()}function ke(t){let e=JSON.parse(d.bytesTo(t,"utf8"));if(e.type==="pair"&&typeof e.secret=="string"&&e.secret)return{type:"pair",secret:e.secret,name:typeof e.name=="string"?e.name:void 0};if(e.type==="unpair")return{type:"unpair"};throw Error("Invalid pairing request")}function Ne(t){let e=JSON.parse(d.bytesTo(t,"utf8"));if(e.ok===!0)return{ok:!0,name:typeof e.name=="string"?e.name:void 0};if(e.ok===!1&&typeof e.error=="string")return{ok:!1,error:e.error};throw Error("Invalid pairing response")}function Z(){return d.bytesTo(crypto.getRandomValues(new Uint8Array(16)),"base64url")}function Ie(t,e){return t instanceof Error?t:Error(e)}var _e=[5e3,1e4,2e4],$e=class{constructor(t,e,r={}){if(this.node=t,this.options=r,this.controller=new AbortController,this.handleConnectionClose=n=>{n.detail.id===this.connection?.id&&(this.connection=void 0,this.options.onConnectionChange?.(),this.connect().catch(()=>{}))},e.length===0)throw Error("At least one relay address is required");this.addresses=e.map(n=>x(n.trim())),t.addEventListener("connection:close",this.handleConnectionClose,{signal:this.controller.signal})}connect(){if(this.controller.signal.throwIfAborted(),this.connection?.status==="open")return Promise.resolve(this.connection);if(this.connecting)return this.connecting;this.connection=void 0;let t=d.retry(_e,async({resolve:e})=>e(await this.dialRelay()),{repeat:3e4,signal:this.controller.signal}).finally(()=>{this.connecting===t&&(this.connecting=void 0),!this.controller.signal.aborted&&!this.connection&&this.connect().catch(()=>{})});return this.connecting=t,t}async stop(){if(this.controller.signal.aborted)return;this.controller.abort();let t=this.connection;this.connection=void 0,this.options.onConnectionChange?.(),await t?.close()}async dialRelay(){let t=this.selectedAddress?[this.selectedAddress]:this.addresses,e;for(let r of t){await d.waitForAvailability(this.controller.signal);let n;try{if(n=await this.node.dial(r,{signal:d.abortSignalAny([this.controller.signal,AbortSignal.timeout(1e4)])}),this.controller.signal.throwIfAborted(),this.connection=n,n.status!=="open")throw this.connection=void 0,Error("Relay connection closed while dialing");return this.selectedAddress=r,this.options.onConnectionChange?.(n),n}catch(i){e=i,await n?.close()}}throw e}},u=B({JsonRpcService:()=>te,JsonRpcTransportLibp2p:()=>ye,PairingEndpointError:()=>P,PairingEndpointRoleError:()=>ne,PairingService:()=>se,RelayConnectionController:()=>$e,decodePairingEndpoint:()=>Re,dialKnownAddresses:()=>ee,encodePairingEndpoint:()=>Ce,jsonRpcService:()=>ve,pairingService:()=>Te});async function ae(){typeof Reflect.get(Promise,"withResolvers")!="function"&&await import("./with-resolvers-3BEBZR45.js")}var ce="/nervos-ckb/khie/json-rpc/0.0.1",le="/dns4/relay.ckbccc.com/tcp/443/wss",R="https://app.ckbccc.com/#khie",de="khie-wallet://app/connect",qe="/nervos-ckb/khie/pairing/0.0.1",Me=1800*1e3;async function Je(t,e,r){e.throwIfAborted(),await ae(),e.throwIfAborted();let[{noise:n},{yamux:i},{circuitRelayTransport:o},{identify:a,identifyPush:s},{webRTC:c},{webSockets:p},{createLibp2p:l}]=await Promise.all([import("./src-HUOL2NUT.js"),import("./src-KDJUQTII.js"),import("./src-W7X5U5OF.js"),import("./src-W2X5S2M3.js"),import("./webrtc.browser-HW7V4DF5.js"),import("./src-2LRJXK4R.js"),import("./src-BTAWNYTA.js")]);return e.throwIfAborted(),l({addresses:{listen:["/p2p-circuit","/webrtc"]},peerStore:{maxAddressAge:1/0},transports:[p(),c(),o()],connectionEncrypters:[n()],streamMuxers:[i()],services:{identify:a(),identifyPush:s(),pairing:u.pairingService({name:r,protocol:qe,pairedPeerTimeoutMs:Me},t)}})}async function pe(t,e,r){let n;try{return n=await Je(t,e,r),e.throwIfAborted(),new g.OwnerUnique(n,i=>i.stop())}catch(i){throw await n?.stop(),i}}var Ue=1e4,De=[5e3,1e4,2e4],Ke=3e4,je=4,A=class{constructor(e,r){this.node=e,this.peerId=r,this.listenersController=new AbortController,this.stopped=!1;let n={signal:this.listenersController.signal};e.addEventListener("peer:disconnect",this.handlePeerDisconnect.bind(this),n),typeof document<"u"&&document.addEventListener("visibilitychange",this.handleVisibilityChange.bind(this),n),this.handlePeerDisconnect()}stop(){this.stopped||(this.stopped=!0,this.cancelReconnect(),this.listenersController.abort())}handleVisibilityChange(){document.visibilityState==="visible"&&this.restartReconnect()}handlePeerDisconnect(e){e!==void 0&&!e.detail.equals(this.peerId)||(this.node.services.pairing.refresh(this.peerId),this.restartReconnect())}restartReconnect(){this.cancelReconnect(),this.startReconnect()}startReconnect(){if(this.stopped||this.reconnectController)return;let e=new AbortController;this.reconnectController=e,this.reconnect(e).finally(()=>{this.reconnectController===e&&(this.reconnectController=void 0)})}cancelReconnect(){this.reconnectController?.abort(),this.reconnectController=void 0}async reconnect(e){try{await g.retry(De,async({index:r,resolve:n})=>{if(await g.waitForAvailability(e.signal),this.hasRequiredConnection(r))return n(void 0);try{await u.dialKnownAddresses(this.node,this.peerId,g.abortSignalAny([e.signal,AbortSignal.timeout(Ue)]))}catch(i){if(this.hasRequiredConnection(r))return n(void 0);throw i}if(this.hasRequiredConnection(r))return n(void 0);throw new Error("Dial did not establish a connection")},{repeat:Ke,signal:e.signal})}catch{}}hasRequiredConnection(e){return this.node.getConnections(this.peerId).some(({direct:r,status:n})=>n==="open"&&(e>=je||r))}};var ze={appEndpoint:"",canPair:!1,ownEndpoint:"",phase:"idle",relayState:"idle"};function he(t){for(let e of t.nodeSubscriptions.splice(0))e()}async function Fe(t){he(t),t.connectionController?.stop();try{t.pendingSigner&&await t.pendingSigner.cleanup()}finally{try{await t.relayController?.stop()}finally{await t.nodeOwner?.dispose()}}}var O=class{constructor(e){this.currentState=ze,this.hasStarted=!1,this.client=e.client,this.name=e.name,this.onConnected=e.onConnected,this.onStateChange=e.onStateChange}get state(){return this.currentState}update(e){this.closing||(this.currentState={...this.currentState,...e},this.onStateChange())}beginOperation(e={}){this.update({...e,error:void 0,errorKind:void 0})}updateError(e,r={}){this.update({...r,error:v(e),errorKind:Ve(e)?"incompatible-peer":void 0})}async start(e){if(this.hasStarted||this.closing)return;this.hasStarted=!0;let r={abortController:new AbortController,nodeSubscriptions:[]};this.resources=r;let n=r.abortController.signal;try{r.nodeOwner=await pe(()=>!n.aborted&&!r.selectedPeer,n,this.name),n.throwIfAborted();let i=r.nodeOwner.value;this.update({canPair:!0}),this.observeNode(r,i),await this.connectRelay(e)}catch(i){this.updateError(i),await this.close()}}close(){if(this.closing)return this.closing;let e=this.resources;return this.resources=void 0,e?.abortController.abort(),this.closing=e?Fe(e):Promise.resolve(),this.closing}observeNode(e,r){let n=0,i=()=>{let o=++n,a=r.getMultiaddrs();if(a.length===0){this.update({appEndpoint:"",ownEndpoint:""});return}let s=r.services.pairing.secret;Promise.all([u.encodePairingEndpoint(R,a,s,"connector"),u.encodePairingEndpoint(de,a,s,"connector")]).then(([c,p])=>{o===n&&this.update({appEndpoint:p,ownEndpoint:c})}).catch(c=>{o===n&&this.updateError(c)})};r.addEventListener("self:peer:update",i),e.nodeSubscriptions.push(()=>r.removeEventListener("self:peer:update",i),r.services.pairing.onSecretChanged(i),r.services.pairing.onError(o=>{this.updateError(o)}),r.services.pairing.onPaired(o=>{this.acceptPeer(o)})),i()}async connectRelay(e){let r=this.resources,n=r?.nodeOwner?.value;if(!n||!e||r.selectedPeer)return;let i=e.trim(),o=r.abortController.signal,a=r.relayController;this.beginOperation({relayState:"connecting"});let s;try{s=new u.RelayConnectionController(n,[i],{onConnectionChange:c=>{r.relayController===s&&this.update({relayState:c?"connected":"connecting"})}}),r.relayController=s,await a?.stop(),await s.connect()}catch(c){if(s&&r.relayController!==s||o.aborted)return;this.updateError(c,{relayState:"failed"})}}async pair(e){let r=this.resources,n=r?.nodeOwner?.value;if(!n||!e||this.currentState.phase!=="idle")return!1;this.beginOperation({phase:"pairing"});let i=r.abortController.signal;try{let o=await u.decodePairingEndpoint(e,"provider");return await n.services.pairing.pair(o,{signal:i}),!0}catch(o){return this.updateError(o),!1}finally{r.selectedPeer||this.update({phase:"idle"})}}async acceptPeer(e){let r=this.resources,n=r?.nodeOwner?.value;if(!r||!n||r.selectedPeer)return;let i=r.abortController.signal;r.selectedPeer=e,this.beginOperation({phase:"pairing"});let o=new u.JsonRpcTransportLibp2p(n,e,{protocol:ce,signal:i,onResponse:()=>n.services.pairing.refresh(e)}),a;try{r.connectionController=new A(n,e),a=await g.SignerJsonRpc.new(this.client,{transport:o}),i.throwIfAborted()}catch(c){r.connectionController?.stop(),r.connectionController=void 0,r.selectedPeer=void 0,this.updateError(c,{phase:"idle"}),await n.services.pairing.unpair(e);return}let s=this.createPairingCleanup(n,e,a);r.pendingSigner={cleanup:s,signer:a},await this.connectSigner()}createPairingCleanup(e,r,n){let i=()=>{},o=async()=>{i(),await e.services.pairing.unpair(r)};return i=e.services.pairing.onUnpaired(a=>{a.equals(r)&&(this.resources?.pendingSigner?.signer===n&&this.updateError(new Error("The wallet unpaired. Go back and pair again."),{signer:void 0}),n.replace(),this.close())}),o}retrySigner(){return this.connectSigner()}async connectSigner(){let e=this.resources,r=e?.pendingSigner,n=e?.nodeOwner,i=e?.selectedPeer;if(!e||!r||!n||!i)return;let{cleanup:o,signer:a}=r;this.beginOperation({phase:"connecting",signer:a});let s=e.abortController.signal;try{if(await a.connect(),!await a.isConnected())throw new Error("Khie signer did not connect");s.throwIfAborted(),he(e);let c=e.abortController,p=e.relayController,l=n.map(b=>b),E=e.connectionController,ue=new g.OwnerUnique(l.value,async()=>{c.abort(),E?.stop();try{await o()}finally{try{await p?.stop()}finally{await l.dispose()}}}),L=new g.OwnerUnique(a,b=>b.disconnect()).map(b=>{let _=V(b);return{wallet:_,signerInfo:new g.SignerInfo(_.name,b)}});a.onReplaced(()=>{L.dispose().catch(()=>{}),ue.dispose().catch(()=>{})}),e.pendingSigner=void 0,this.resources=void 0;try{this.onConnected(L)}catch(b){throw await L.dispose(),b}}catch(c){this.updateError(c)}}};function Ve(t){return t instanceof u.PairingEndpointError||t instanceof Error&&t.name==="UnsupportedProtocolError"}var f=function(t,e,r,n){var i=arguments.length,o=i<3?e:n===null?n=Object.getOwnPropertyDescriptor(e,r):n,a;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")o=Reflect.decorate(t,e,r,n);else for(var s=t.length-1;s>=0;s--)(a=t[s])&&(o=(i<3?a(o):i>3?a(e,r,o):a(e,r))||o);return i>3&&o&&Object.defineProperty(e,r,o),o},y,m=(y=class extends q{constructor(){super(...arguments),this.isAdvancedSettingsOpen=!1,this.khieEndpoint="",this.isScanning=!1,this.hasAttemptedToOpenApp=!1,this.qrScanned=e=>{this.khieEndpoint=e.value.trim(),this.isScanning=!1,this.pair()},this.scannerError=e=>{this.localError=`Unable to scan pairing code: ${v(e.error)}`,this.isScanning=!1}}get relayAddress(){return this.relayAddressOverride??this.defaultRelayAddress??le}connectedCallback(){super.connectedCallback(),this.localError=void 0,this.relayAddressOverride=void 0,this.hasAttemptedToOpenApp=!1,this.session=new O({name:this.appName,client:this.client,onConnected:e=>{this.dispatchEvent(new j(()=>{if(e.isValid)try{this.dispatchEvent(new J(e))}finally{e.dispose().catch(()=>{})}}))},onStateChange:()=>{this.session.state.phase!=="idle"&&(this.localError=void 0,this.hasAttemptedToOpenApp=!1),this.requestUpdate()}}),this.session.start(this.relayAddress.trim())}disconnectedCallback(){super.disconnectedCallback(),this.session.close()}close(){this.isScanning=!1,this.session.close()}cancelScan(){return this.isScanning?(this.isScanning=!1,!0):!1}async pair(){let e=this.khieEndpoint.trim();e&&(this.localError=void 0,await this.session.pair(e)&&(this.khieEndpoint=""))}startScanner(){this.isScanning=!0,this.localError=void 0}connectRelay(){this.session.connectRelay(this.relayAddress.trim())}render(){let{appEndpoint:e,canPair:r,error:n,errorKind:i,ownEndpoint:o,phase:a,relayState:s,signer:c}=this.session.state,p=this.localError??n;return a==="pairing"||a==="connecting"?h`<ccc-connecting
        .name=${c?.name??z}
        .icon=${F(c?.icon)}
        .error=${p}
        .hint=${c?"Approve the connection in Khie to continue":"Establishing secure connection\u2026"}
        .onRetry=${c?()=>{this.session.retrySigner()}:void 0}
      ></ccc-connecting>`:this.isScanning?h`<ccc-qr-scanner
        @qr-scanned=${this.qrScanned}
        @error=${this.scannerError}
      ></ccc-qr-scanner>`:h`
      <div class="pairing-layout">
        <section class="field pairing-side own-side">
          <label>Let a wallet scan this</label>
          <div class="endpoint-pair">
            <ccc-qr-code
              class="qr-code"
              .value=${o}
              alt="Connector pairing code"
              @error=${l=>{this.localError=v(l.error)}}
            ></ccc-qr-code>
            ${s==="failed"?h`<ccc-button-pill @click=${()=>this.connectRelay()}>
                    ${U} Try again
                  </ccc-button-pill>`:o?h`<div class="endpoint-details">
                      <div class="endpoint-actions">
                        <ccc-copy-button
                          .value=${o}
                          class="endpoint-copy"
                          title="Tap to copy pairing code"
                          aria-label="Copy connector pairing code"
                          @error=${l=>{this.localError=v(l.error)}}
                        >
                          <span>Tap to copy pairing code</span>
                        </ccc-copy-button>
                        ${e?h`<a
                                class="open-app-pill"
                                href=${e}
                                @click=${()=>{this.hasAttemptedToOpenApp=!0}}
                                >Open Wallet</a
                              >`:void 0}
                      </div>
                      ${this.hasAttemptedToOpenApp&&e?h`<span class="open-app-status" role="status"
                              >If the wallet app doesn't open, install a wallet
                              that supports Khie or pair manually.</span
                            >`:void 0}
                    </div>`:h`<span class="endpoint-pending"
                      >Connecting relay…</span
                    >`}
          </div>
        </section>

        <div class="divider" aria-hidden="true"><span>or</span></div>

        <section class="field pairing-side remote-side">
          <label>Scan wallet code</label>
          <div class="remote-actions">
            <ccc-button @click=${()=>this.startScanner()}>
              ${W} Scan wallet code
            </ccc-button>
            <div class="endpoint-control">
              <ccc-input
                class="endpoint-input"
                .value=${this.khieEndpoint}
                aria-label="Wallet pairing code"
                placeholder="Or paste pairing code"
                spellcheck="false"
                @input=${l=>{this.khieEndpoint=l.currentTarget.value}}
                @keydown=${l=>{l.key==="Enter"&&this.pair()}}
              ></ccc-input>
              <button
                class="endpoint-submit"
                aria-label="Connect"
                title="Connect"
                ?disabled=${!r||!this.khieEndpoint.trim()}
                @click=${()=>this.pair()}
              >
                ${D}
              </button>
            </div>
            <p class="khie-help">
              Khie is a peer-to-peer protocol that connects wallets and
              applications.
              <a
                href=${o||R}
                target="_blank"
                rel="noopener noreferrer"
                >Learn more about Khie here</a
              >, where you can also connect a local wallet from the device where
              it is available.
            </p>
          </div>

          <button
            class="text-button advanced-toggle"
            aria-expanded=${this.isAdvancedSettingsOpen}
            aria-controls="khie-advanced-settings"
            @click=${()=>{this.isAdvancedSettingsOpen=!this.isAdvancedSettingsOpen}}
          >
            <span>Advanced settings</span>
            <span class="settings-chevron">${K}</span>
          </button>
        </section>

        ${this.isAdvancedSettingsOpen?h`<section
                class="field advanced-settings"
                id="khie-advanced-settings"
              >
                <label>Relay multiaddr</label>
                <div class="relay-control">
                  <ccc-input
                    class="relay-input"
                    .value=${this.relayAddress}
                    aria-label="Relay multiaddr"
                    placeholder="/dns4/relay.example/tcp/443/wss"
                    spellcheck="false"
                    @input=${l=>{this.relayAddressOverride=l.currentTarget.value}}
                  ></ccc-input>
                  <button
                    ?disabled=${!r||!this.relayAddress.trim()||s==="connecting"}
                    @click=${()=>this.connectRelay()}
                  >
                    ${s==="connecting"?"Connecting\u2026":s==="connected"?"Reconnect":"Connect relay"}
                  </button>
                </div>
              </section>`:void 0}
      </div>
      ${p&&!this.localError&&i==="incompatible-peer"?h`<div class="compatibility-help" role="alert">
              <strong>This is not a compatible Khie pairing code</strong>
              <span>
                Scan a pairing code from a wallet.
                ${this.khieEndpoint?h`<a
                        href=${this.khieEndpoint}
                        target="_blank"
                        rel="noopener noreferrer"
                        >Go here to learn more.</a
                      >`:void 0}
              </span>
            </div>`:void 0}
      ${p&&(this.localError||i!=="incompatible-peer")?h`<span class="error">${p}</span>`:void 0}
    `}},y.styles=$`
    :host {
      display: flex;
      width: min(44rem, calc(100vw - 4rem));
      flex-direction: column;
      gap: 1rem;
    }

    .pairing-layout {
      display: grid;
      min-width: 0;
      grid-template-columns: minmax(0, 1fr) 2.25rem minmax(0, 1fr);
      gap: 1rem;
    }

    .field {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 0.5rem;
    }

    label {
      font-size: 0.85rem;
      font-weight: 600;
    }

    .pairing-side {
      min-height: 17.5rem;
    }

    .own-side {
      grid-row: 1;
      grid-column: 1;
    }

    .remote-side {
      display: grid;
      grid-row: 1;
      grid-column: 3;
      grid-template-rows: auto minmax(0, 1fr) auto;
    }

    button {
      box-sizing: border-box;
      padding: 0.65rem 0.85rem;
      border: 1px solid var(--divider);
      border-radius: 0.4rem;
      color: var(--btn-color, inherit);
      background: var(--btn-primary);
      font: inherit;
      cursor: pointer;
    }

    button:hover:not(:disabled) {
      color: var(--btn-color-hover, var(--btn-color, inherit));
      background: var(--btn-primary-hover);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .endpoint-input {
      min-width: 0;
      height: 2.7rem;
    }

    .endpoint-pair {
      display: grid;
      min-width: 0;
      justify-items: center;
      gap: 0.75rem;
    }

    .qr-code {
      width: min(13rem, 100%);
    }

    .endpoint-details {
      display: grid;
      width: 100%;
      min-width: 0;
      gap: 0.25rem;
    }

    .endpoint-actions {
      display: flex;
      flex-wrap: wrap;
      width: 100%;
      min-width: 0;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }

    .open-app-pill {
      display: inline-flex;
      align-items: center;
      padding: 0.25rem 1rem;
      border-radius: 9999px;
      color: var(--btn-color, inherit);
      background: var(--btn-secondary);
      font-size: 0.72rem;
      text-decoration: none;
      transition:
        background 0.15s ease-in-out,
        color 0.15s ease-in-out;
      white-space: nowrap;
    }

    .open-app-pill:hover {
      color: var(--btn-color-hover, var(--btn-color, inherit));
      background: var(--btn-secondary-hover);
    }

    .open-app-status {
      color: var(--tip-color);
      font-size: 0.72rem;
      text-align: center;
    }

    .endpoint-pending {
      box-sizing: border-box;
      width: 100%;
      min-height: 2.7rem;
    }

    .endpoint-copy {
      box-sizing: border-box;
      display: flex;
      width: fit-content;
      max-width: 100%;
      min-width: 0;
      align-items: center;
      gap: 0.7rem;
      color: var(--btn-color, inherit);
      cursor: pointer;
      text-align: left;
      transition: color 0.15s ease-in-out;
    }

    .endpoint-copy:hover {
      color: var(--btn-color-hover, var(--btn-color, inherit));
    }

    .endpoint-copy span {
      overflow: hidden;
      font-family: monospace;
      font-size: 0.72rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .endpoint-pending {
      display: flex;
      padding: 0.65rem 0.85rem;
      align-items: center;
      justify-content: center;
      color: var(--tip-color);
      font-size: 0.8rem;
    }

    .khie-help {
      margin: 0.25rem 0 0;
      color: var(--tip-color);
      font-size: 0.72rem;
      line-height: 1.4;
    }

    .khie-help a {
      color: inherit;
      text-underline-offset: 0.15em;
      transition: color 0.15s ease-in-out;
    }

    .khie-help a:hover {
      color: var(--btn-color-hover, var(--btn-color, inherit));
    }

    .divider {
      position: relative;
      display: grid;
      grid-row: 1;
      grid-column: 2;
      color: var(--tip-color);
      font-size: 0.7rem;
      place-items: center;
      text-transform: uppercase;
    }

    .divider::before {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 50%;
      width: 1px;
      background: var(--divider);
      content: "";
    }

    .divider span {
      z-index: 1;
      padding: 0.5rem 0.25rem;
      background: var(--background);
    }

    .remote-actions {
      display: grid;
      align-content: center;
      gap: 0.5rem;
    }

    .endpoint-control,
    .relay-control {
      display: grid;
      min-width: 0;
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .endpoint-control {
      overflow: hidden;
      border: 1px solid var(--divider);
      border-radius: 0.4rem;
    }

    .endpoint-control:focus-within {
      border-color: var(--tip-color-hover, var(--tip-color));
    }

    .endpoint-input::part(input) {
      height: 100%;
      padding: 0.65rem;
      border: 0;
      border-radius: 0;
    }

    .endpoint-submit {
      display: grid;
      width: 2.7rem;
      height: 2.7rem;
      padding: 0;
      border: 0;
      border-radius: 0;
      color: var(--btn-color-hover, var(--btn-color, inherit));
      background: transparent;
      place-items: center;
    }

    .endpoint-submit:hover:not(:disabled) {
      background: transparent;
    }

    .endpoint-submit:disabled {
      color: var(--divider);
      opacity: 1;
    }

    .endpoint-submit svg {
      width: 1.3rem;
      height: 1.3rem;
    }

    .text-button {
      padding: 0;
      border: 0;
      color: var(--tip-color);
      background: transparent;
      font-size: 0.72rem;
    }

    .text-button:hover:not(:disabled) {
      color: var(--tip-color-hover, var(--tip-color));
      background: transparent;
    }

    .advanced-toggle {
      display: flex;
      align-items: center;
      justify-self: end;
      gap: 0.3rem;
    }

    .settings-chevron {
      display: grid;
      transform: rotate(-90deg);
      transition: transform 0.15s ease-in-out;
      --left-stroke-width: 2.5;
    }

    .settings-chevron svg {
      width: 0.65rem;
      height: 0.65rem;
    }

    .advanced-toggle[aria-expanded="true"] .settings-chevron {
      transform: rotate(90deg);
    }

    .advanced-settings {
      grid-row: 2;
      grid-column: 1 / -1;
      animation: advanced-settings-enter 0.2s ease-out both;
    }

    .relay-control {
      gap: 0.5rem;
    }

    .relay-input {
      min-width: 0;
      height: 100%;
    }

    .relay-input::part(input) {
      height: 100%;
      padding: 0.65rem;
      border-color: var(--divider);
      border-radius: 0.4rem;
    }

    .relay-control button {
      white-space: nowrap;
    }

    @keyframes advanced-settings-enter {
      from {
        opacity: 0;
        transform: translateY(-0.35rem);
      }
    }

    .error {
      display: block;
      color: var(--tip-color);
      font-size: 0.8rem;
      text-align: center;
    }

    .compatibility-help {
      display: grid;
      padding: 0.8rem 0.9rem;
      border: 1px solid var(--divider);
      border-radius: 0.4rem;
      gap: 0.3rem;
    }

    .compatibility-help strong {
      font-size: 0.85rem;
    }

    .compatibility-help span {
      color: var(--tip-color);
      font-size: 0.78rem;
      line-height: 1.45;
    }

    .compatibility-help a {
      color: inherit;
      text-decoration: underline;
      text-underline-offset: 0.15em;
    }

    @media (max-width: 40rem) {
      :host {
        width: min(28rem, calc(100vw - 4rem));
      }

      .qr-code {
        /* I hate Apple */
        width: min(22rem, calc(100% - 1.5rem));
        height: min(22rem, calc(100vw - 5.5rem));
      }

      .pairing-layout {
        grid-template-columns: minmax(0, 1fr);
      }

      .divider {
        height: 1.25rem;
        grid-row: 2;
        grid-column: 1;
      }

      .divider::before {
        top: 50%;
        right: 0;
        bottom: auto;
        left: 0;
        width: auto;
        height: 1px;
      }

      .divider span {
        padding: 0.25rem 0.5rem;
      }

      .remote-side {
        min-height: 11rem;
        grid-row: 3;
        grid-column: 1;
      }

      .advanced-settings {
        grid-row: 4;
      }
    }
  `,y);f([C({attribute:!1})],m.prototype,"appName",void 0);f([C({attribute:!1})],m.prototype,"client",void 0);f([C({attribute:!1})],m.prototype,"defaultRelayAddress",void 0);f([w()],m.prototype,"relayAddressOverride",void 0);f([w()],m.prototype,"isAdvancedSettingsOpen",void 0);f([w()],m.prototype,"khieEndpoint",void 0);f([w()],m.prototype,"isScanning",void 0);f([w()],m.prototype,"hasAttemptedToOpenApp",void 0);f([w()],m.prototype,"localError",void 0);m=f([M("ccc-khie-pairing")],m);export{m as KhiePairing};
