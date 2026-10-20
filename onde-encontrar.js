(function(){
  var DATA=window.GP_DATA;
  var KINDS=[['all','Todos'],['s','Sorveterias e açaí'],['p','Padarias'],['b','Bares e lanchonetes'],['m','Mercados'],['o','Outros']];
  var KL={s:'Sorveteria / açaí',p:'Padaria',b:'Bar / lanchonete',m:'Mercado',o:'Outro comércio'};
  var KORDER={s:0,p:1,b:2,m:3,o:4};
  var NS='http://www.w3.org/2000/svg';
  var svg=document.getElementById('map'),box=document.getElementById('map-box'),tip=document.getElementById('tip');
  var listEl=document.getElementById('list'),notice=document.getElementById('notice'),resetBtn=document.getElementById('map-reset');
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

  function norm(s){return (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()}
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function km(a,b){var R=6371,r=Math.PI/180,dA=(b.lat-a.lat)*r,dO=(b.lng-a.lng)*r,h=Math.sin(dA/2)*Math.sin(dA/2)+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dO/2)*Math.sin(dO/2);return 2*R*Math.asin(Math.sqrt(h))}
  function fmtKm(d){return d<1?Math.round(d*1000)+' m':(d<10?d.toFixed(1).replace('.',','):Math.round(d).toLocaleString('pt-BR'))+' km'}
  function bucket(n){return n>100?5:n>50?4:n>20?3:n>5?2:1}
  function nf(n){return n.toLocaleString('pt-BR')}
  function plural(n,a,b){return nf(n)+' '+(n===1?a:b)}

  /* projeção */
  var COS=Math.cos(20.5*Math.PI/180);
  function X(lng){return (lng+52)*100*COS}
  function Y(lat){return (-17.5-lat)*100}

  /* dados */
  var MUNI={},MLIST=DATA.munis;
  MLIST.forEach(function(m){m.stores=[];m.key=norm(m.n);MUNI[m.id]=m});
  var STORES=DATA.stores.map(function(r,i){var m=MUNI[r[4]];var s={id:i,name:r[0],k:r[1],addr:r[2],hood:r[3],m:m,tel:r[5],lat:r[6],lng:r[7],exact:!!r[8]};m.stores.push(s);return s});
  var HAS=MLIST.filter(function(m){return m.stores.length});

  var st={kind:'all',mode:'cities',city:null,origin:null,here:null,items:[],limit:30,sel:null,q:''};

  /* ---------- desenho base ---------- */
  function el(n,a,p){var e=document.createElementNS(NS,n);for(var k in a)e.setAttribute(k,a[k]);if(p)p.appendChild(e);return e}
  function ringD(r){var d='';for(var i=0;i<r.length;i++){d+=(i?'L':'M')+X(r[i][0]).toFixed(1)+' '+Y(r[i][1]).toFixed(1)}return d+'Z'}
  var gM=el('g',{},svg),gUF=el('g',{},svg),gL=el('g',{},svg),gD=el('g',{},svg);
  MLIST.forEach(function(m){
    var p=el('path',{d:m.r.map(ringD).join(''),'class':'m'+(m.stores.length?' has':''),'data-id':m.id},gM);m.path=p;
  });
  DATA.states.forEach(function(s){el('path',{d:s.r.map(ringD).join(''),'class':'uf'},gUF)});

  /* ---------- câmera ----------
     O SVG é desenhado com sobra (2x a área visível). Durante o gesto só movemos a imagem
     com transform (GPU), e o redesenho acontece quando o gesto termina. */
  var view={x:0,y:0,w:1,h:1},R=null,anim=null,commitT=null;
  var BR=null;function bRect(){if(!BR)BR=box.getBoundingClientRect();return BR}
  window.addEventListener('scroll',function(){BR=null},{passive:true});
  function aspect(){var r=bRect();return r.width&&r.height?r.width/r.height:1.2}
  function pxScale(){var r=bRect();return (r.width||600)/(R?R.w:view.w)}
  function fitB(b,minSpan){
    var x0=X(b[0]),x1=X(b[2]),y0=Y(b[3]),y1=Y(b[1]);
    var w=Math.max(x1-x0,minSpan||6),h=Math.max(y1-y0,minSpan||6),cx=(x0+x1)/2,cy=(y0+y1)/2;
    w*=1.18;h*=1.18;var a=aspect();if(w/h<a)w=h*a;else h=w/a;return {x:cx-w/2,y:cy-h/2,w:w,h:h};
  }
  function boundsOf(pts){var b=[180,90,-180,-90];pts.forEach(function(p){b[0]=Math.min(b[0],p.lng);b[1]=Math.min(b[1],p.lat);b[2]=Math.max(b[2],p.lng);b[3]=Math.max(b[3],p.lat)});return b}
  function mb(ms){var b=[180,90,-180,-90];ms.forEach(function(m){b[0]=Math.min(b[0],m.b[0]);b[1]=Math.min(b[1],m.b[1]);b[2]=Math.max(b[2],m.b[2]);b[3]=Math.max(b[3],m.b[3])});return b}
  var HOME=null,FB=(function(){var b=[1e9,1e9,-1e9,-1e9];DATA.states.forEach(function(s){s.r.forEach(function(r){r.forEach(function(q){var x=X(q[0]),y=Y(q[1]);if(x<b[0])b[0]=x;if(x>b[2])b[2]=x;if(y<b[1])b[1]=y;if(y>b[3])b[3]=y})})});return {x0:b[0],y0:b[1],x1:b[2],y1:b[3]}})();
  function clampV(v){
    var a=v.w/v.h,fw=FB.x1-FB.x0,fh=FB.y1-FB.y0,maxW=Math.max(fw,fh*a)*1.04,minW=4,cx=v.x+v.w/2,cy=v.y+v.h/2;
    if(v.w>maxW){v.w=maxW;v.h=maxW/a}if(v.w<minW){v.w=minW;v.h=minW/a}
    var pad=v.w*.04;
    if(v.w>=fw+2*pad)cx=(FB.x0+FB.x1)/2;else cx=Math.min(Math.max(cx,FB.x0-pad+v.w/2),FB.x1+pad-v.w/2);
    if(v.h>=fh+2*pad)cy=(FB.y0+FB.y1)/2;else cy=Math.min(Math.max(cy,FB.y0-pad+v.h/2),FB.y1+pad-v.h/2);
    return {x:cx-v.w/2,y:cy-v.h/2,w:v.w,h:v.h};
  }
  function commit(){
    clearTimeout(commitT);commitT=null;BR=null;
    R={x:view.x,y:view.y,w:view.w,h:view.h};
    svg.setAttribute('viewBox',(R.x-R.w/2)+' '+(R.y-R.h/2)+' '+(2*R.w)+' '+(2*R.h));
    svg.style.transform='';overlay();
  }
  function apply(now){
    if(!R||now){commit();return}
    var r=bRect(),W=r.width,H=r.height,k=R.w/view.w,s=W/view.w;
    var tx=W/2-k*W/2+(R.x-view.x)*s,ty=H/2-k*H/2+(R.y-view.y)*s;
    /* se a imagem pré-desenhada não cobre mais a área, redesenha na hora */
    if(k>3||k<.55||Math.abs(tx-(W/2-k*W/2))>W*.45*k||Math.abs(ty-(H/2-k*H/2))>H*.45*k){commit();return}
    svg.style.transform='translate3d('+tx+'px,'+ty+'px,0) scale('+k+')';
  }
  var raf=null;function schedule(){if(raf)return;raf=requestAnimationFrame(function(){raf=null;overlay()})}
  function settle(ms){clearTimeout(commitT);commitT=setTimeout(commit,ms||140)}
  function goTo(t){
    t=clampV(t);if(anim)cancelAnimationFrame(anim);
    if(reduce){view=t;commit();return}
    var f={x:view.x,y:view.y,w:view.w,h:view.h},t0=performance.now(),D=480;
    (function step(now){var k=Math.min(1,(now-t0)/D),e=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;
      view={x:f.x+(t.x-f.x)*e,y:f.y+(t.y-f.y)*e,w:f.w+(t.w-f.w)*e,h:f.h+(t.h-f.h)*e};
      if(k<1){apply();anim=requestAnimationFrame(step)}else{anim=null;commit()}})(t0);
  }
  function zoomAt(f,sx,sy,live){
    var r=bRect(),ux=view.x+(sx-r.left)/r.width*view.w,uy=view.y+(sy-r.top)/r.height*view.h;
    var nw=view.w*f,nh=view.h*f;
    view=clampV({x:ux-(ux-view.x)*(nw/view.w),y:uy-(uy-view.y)*(nh/view.h),w:nw,h:nh});
    apply();if(!live)settle();
  }

  /* ---------- rótulos, pontos e você ---------- */
  function overlay(){
    while(gL.firstChild)gL.removeChild(gL.firstChild);
    while(gD.firstChild)gD.removeChild(gD.firstChild);
    var V=R||view,s=pxScale(),placed=[],vx0=V.x-V.w/2,vy0=V.y-V.h/2,vx1=V.x+1.5*V.w,vy1=V.y+1.5*V.h;
    function fits(x,y,w,h){for(var i=0;i<placed.length;i++){var p=placed[i];if(x<p[2]&&x+w>p[0]&&y<p[3]&&y+h>p[1])return false}placed.push([x-4,y-3,x+w+4,y+h+3]);return true}
    /* siglas dos estados */
    [['SP',-49.2,-22.4],['MG',-47.4,-18.7]].forEach(function(u){
      var t=el('text',{x:X(u[1]),y:Y(u[2]),'class':'uft','font-size':(Math.min(64,Math.max(28,s*60)))/s,'text-anchor':'middle'},gL);t.textContent=u[0];
    });
    /* candidatos: selecionada, com ponto (por quantidade), depois sem ponto (quando perto) */
    var cand=[];
    if(st.city)cand.push({m:st.city,big:true});
    if(st.here&&st.here!==st.city)cand.push({m:st.here,big:true});
    HAS.slice().sort(function(a,b){return b.stores.length-a.stores.length}).forEach(function(m){if(m!==st.city&&m!==st.here)cand.push({m:m})});
    if(s>5)MLIST.forEach(function(m){if(!m.stores.length&&m!==st.here)cand.push({m:m,dim:true})});
    var drawn=0;
    for(var i=0;i<cand.length&&drawn<160;i++){
      var c=cand[i],m=c.m,ux=X(m.c[0]),uy=Y(m.c[1]);
      if(ux<vx0||ux>vx1||uy<vy0||uy>vy1)continue;
      var fpx=c.big?15:(c.dim?11:(m.stores.length>60?13.5:12.5));
      var sx=(ux-vx0)*s,sy=(uy-vy0)*s,tw=m.n.length*fpx*.62,th=fpx*1.1;
      /* cidades com ponto só ganham rótulo quando cabem; as menores aparecem ao aproximar */
      var mw=(X(m.b[2])-X(m.b[0]))*s;
      if(!c.big&&c.dim&&mw<tw*.9)continue;
      if(!c.big&&!c.dim&&mw<26&&m.stores.length<40)continue;
      if(!fits(sx-tw/2,sy-th/2,tw,th))continue;
      var t=el('text',{x:ux,y:uy+fpx*.35/s,'text-anchor':'middle','class':'lb'+(c.dim?' dim':''),'font-size':fpx/s,'stroke-width':3/s},gL);t.textContent=m.n;drawn++;
    }
    /* pontos da cidade aberta / da lista */
    var showDots=st.mode==='cities'?[]:(st.mode==='city'?st.items:st.items.slice(0,st.limit));
    showDots.forEach(function(p){
      if(!p.exact)return;
      var on=st.sel===p.id,r=(on?7:5)/s;
      var d=el('circle',{cx:X(p.lng),cy:Y(p.lat),r:r,'class':'dot'+(on?' on':''),'stroke-width':1.5/s,'data-s':p.id},gD);
    });
    if(st.origin&&st.origin.you){
      var ox=X(st.origin.lng),oy=Y(st.origin.lat);
      el('circle',{cx:ox,cy:oy,r:16/s,'class':'you-ring'},gD);
      el('circle',{cx:ox,cy:oy,r:6/s,'class':'you','stroke-width':2.5/s},gD);
    }
  }

  /* ---------- interação no mapa ---------- */
  var ptrs={},drag=null,moved=false,pinch=null;
  svg.addEventListener('pointerdown',function(e){
    svg.setPointerCapture&&svg.setPointerCapture(e.pointerId);
    ptrs[e.pointerId]={x:e.clientX,y:e.clientY};moved=false;
    var ids=Object.keys(ptrs);
    BR=null;if(ids.length===1){drag={x:e.clientX,y:e.clientY,v:{x:view.x,y:view.y,w:view.w,h:view.h}}}
    else if(ids.length===2){var a=ptrs[ids[0]],b=ptrs[ids[1]];pinch={d:Math.hypot(a.x-b.x,a.y-b.y),cx:(a.x+b.x)/2,cy:(a.y+b.y)/2};drag=null}
  });
  svg.addEventListener('pointermove',function(e){
    if(ptrs[e.pointerId])ptrs[e.pointerId]={x:e.clientX,y:e.clientY};
    var ids=Object.keys(ptrs);
    if(pinch&&ids.length===2){var a=ptrs[ids[0]],b=ptrs[ids[1]],d=Math.hypot(a.x-b.x,a.y-b.y);if(d>0){zoomAt(pinch.d/d,pinch.cx,pinch.cy,true);pinch.d=d}moved=true;hideTip();return}
    if(drag){var dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!moved&&Math.hypot(dx,dy)>4){moved=true;svg.classList.add('drag');hideTip()}
      if(moved){if(anim){cancelAnimationFrame(anim);anim=null}var r=bRect(),k=drag.v.w/r.width;view=clampV({x:drag.v.x-dx*k,y:drag.v.y-dy*k,w:drag.v.w,h:drag.v.h});apply()}return}
    hover(e);
  });
  function endPtr(e){delete ptrs[e.pointerId];if(Object.keys(ptrs).length<2)pinch=null;if(!Object.keys(ptrs).length){var was=drag||moved;drag=null;svg.classList.remove('drag');if(was&&moved)commit()}}
  svg.addEventListener('pointerup',function(e){
    var wasMoved=moved;endPtr(e);if(wasMoved)return;
    var t=document.elementFromPoint(e.clientX,e.clientY);if(!t)return;
    if(t.getAttribute&&t.getAttribute('data-s')){pick(+t.getAttribute('data-s'),true);return}
    var id=t.getAttribute&&t.getAttribute('data-id');if(!id)return;
    var m=MUNI[id];if(m.stores.length)openCity(m,null);else nearestFrom({lat:m.c[1],lng:m.c[0]},m,'Ainda não temos ponto em <b>'+esc(m.n)+'</b>. O mais perto fica em <b>{c}</b>, a <b>{d}</b>.');
  });
  svg.addEventListener('pointercancel',endPtr);
  svg.addEventListener('pointerleave',function(){hideTip();setHov(null)});
  svg.addEventListener('wheel',function(e){e.preventDefault();zoomAt(Math.exp(e.deltaY*.0016),e.clientX,e.clientY)},{passive:false});
  document.getElementById('z-in').addEventListener('click',function(){var r=bRect();zoomBtn(1/1.7)});
  document.getElementById('z-out').addEventListener('click',function(){var r=bRect();zoomBtn(1.7)});

  function zoomBtn(f){var cx=view.x+view.w/2,cy=view.y+view.h/2,w=view.w*f,h=view.h*f;goTo({x:cx-w/2,y:cy-h/2,w:w,h:h})}
  var hovM=null;
  function setHov(m){if(hovM===m)return;if(hovM)hovM.path.classList.remove('hov');hovM=m;if(m&&m.stores.length)m.path.classList.add('hov');
    listEl.querySelectorAll('.city-row.hov').forEach(function(r){r.classList.remove('hov')});
    if(m){var row=listEl.querySelector('.city-row[data-id="'+m.id+'"]');if(row)row.classList.add('hov')}}
  function hover(e){
    var t=e.target,id=t.getAttribute&&t.getAttribute('data-id');
    if(t.getAttribute&&t.getAttribute('data-s')){var p=STORES[+t.getAttribute('data-s')];showTip(e,esc(p.name),KL[p.k]);setHov(null);return}
    if(!id){hideTip();setHov(null);return}
    var m=MUNI[id],n=countKind(m.stores);setHov(m);
    showTip(e,esc(m.n)+' <small style="opacity:.6">'+m.uf+'</small>',m.stores.length?(n?plural(n,'ponto','pontos')+(st.kind!=='all'?' de '+KINDS.filter(function(k){return k[0]===st.kind})[0][1].toLowerCase():''):'Nenhum ponto desse tipo'):'Ainda sem ponto · ver o mais perto');
  }
  function showTip(e,a,b){var r=box.getBoundingClientRect();tip.innerHTML=a+'<span>'+b+'</span>';tip.style.left=(e.clientX-r.left)+'px';tip.style.top=(e.clientY-r.top)+'px';tip.hidden=false}
  function hideTip(){tip.hidden=true}

  /* ---------- filtros ---------- */
  function okKind(p){return st.kind==='all'||p.k===st.kind}
  function countKind(arr){var n=0;for(var i=0;i<arr.length;i++)if(okKind(arr[i]))n++;return n}
  var typesEl=document.getElementById('types');
  KINDS.forEach(function(k){var b=document.createElement('button');b.type='button';b.id='k-'+k[0];b.dataset.k=k[0];b.setAttribute('aria-pressed',k[0]==='all');
    b.addEventListener('click',function(){st.kind=k[0];st.limit=30;refresh()});typesEl.appendChild(b)});
  function paintTypes(base){
    typesEl.querySelectorAll('button').forEach(function(b){var k=b.dataset.k,n=k==='all'?base.length:base.filter(function(p){return p.k===k}).length;
      b.textContent=KINDS.filter(function(x){return x[0]===k})[0][1]+' '+nf(n);b.setAttribute('aria-pressed',st.kind===k?'true':'false');b.disabled=!n&&k!=='all'});
    HAS.forEach(function(m){var n=countKind(m.stores);m.path.classList.toggle('has',n>0);m.path.classList.remove('b1','b2','b3','b4','b5');if(n)m.path.classList.add('b'+bucket(n))});
  }

  /* ---------- lista ---------- */
  function card(p){
    var dist=st.origin&&st.origin.you?(p.exact?'':'~')+fmtKm(km(st.origin,p)):'';
    var where=p.hood?esc(p.hood)+'<br>':'';
    var q=encodeURIComponent([p.name,p.hood,p.m.n+' - '+p.m.uf].filter(Boolean).join(', '));
    var route=p.exact?'https://www.google.com/maps/dir/?api=1&destination='+p.lat+','+p.lng:'https://www.google.com/maps/search/?api=1&query='+q;
    return '<article class="store'+(st.sel===p.id?' on':'')+'" id="st-'+p.id+'" data-s="'+p.id+'">'+
      '<div class="store-top"><h3>'+esc(p.name)+'</h3>'+(dist?'<span class="dist">'+dist+'</span>':'')+'</div>'+
      '<span class="kind k-'+p.k+'">'+KL[p.k]+'</span>'+
      '<p class="addr">'+where+esc(p.m.n)+' – '+p.m.uf+'</p>'+
      (p.exact?'':'<span class="approx">Posição no mapa aproximada</span>')+
      '<div class="store-foot"><span></span><a class="route" href="'+route+'" target="_blank" rel="noopener">Como chegar</a></div></article>';
  }
  function render(){
    var html='';
    if(st.mode==='cities'){
      paintTypes(STORES);
      var rows=HAS.map(function(m){return {m:m,n:countKind(m.stores)}}).filter(function(r){return r.n}).sort(function(a,b){return b.n-a.n||a.m.n.localeCompare(b.m.n)});
      var tot=rows.reduce(function(a,r){return a+r.n},0);
      notice.innerHTML='<b>'+plural(tot,'ponto','pontos')+'</b> em <b>'+plural(rows.length,'cidade','cidades')+'</b>. Escolha uma cidade no mapa ou na lista.';
      html=rows.map(function(r){return '<button type="button" class="city-row" data-id="'+r.m.id+'"><strong><i class="sw b'+bucket(r.n)+'"></i>'+esc(r.m.n)+'<small>'+r.m.uf+'</small></strong><span class="n"><b>'+nf(r.n)+'</b> '+(r.n===1?'ponto':'pontos')+'</span></button>'}).join('');
    } else {
      var shown=st.items.slice(0,st.limit);
      html=shown.map(card).join('');
      if(st.items.length>st.limit)html+='<button type="button" class="btn btn-ghost more" id="more">Mostrar mais '+Math.min(30,st.items.length-st.limit)+' de '+nf(st.items.length-st.limit)+' restantes</button>';
      if(!st.items.length)html='<p class="notice" style="padding:8px">Nenhum ponto desse tipo aqui. Tente "Todos".</p>';
    }
    listEl.innerHTML=html;listEl.scrollTop=0;
    resetBtn.hidden=st.mode==='cities';
    MLIST.forEach(function(m){m.path.classList.toggle('sel',m===st.city);m.path.classList.toggle('here',m===st.here&&m!==st.city)});
    schedule();
  }
  listEl.addEventListener('click',function(e){
    var r=e.target.closest('.city-row');if(r){openCity(MUNI[r.dataset.id],null);return}
    if(e.target.id==='more'){var top=listEl.scrollTop;st.limit+=30;render();listEl.scrollTop=top;return}
  });
  listEl.addEventListener('mouseover',function(e){
    var r=e.target.closest('.city-row');if(r){var m=MUNI[r.dataset.id];if(hovM!==m){if(hovM)hovM.path.classList.remove('hov');hovM=m;m.path.classList.add('hov')}return}
    var c=e.target.closest('.store');if(c)pick(+c.dataset.s,false);
  });
  listEl.addEventListener('mouseleave',function(){if(hovM){hovM.path.classList.remove('hov');hovM=null}});
  function pick(id,scroll){
    if(st.sel===id&&!scroll)return;st.sel=id;schedule();
    listEl.querySelectorAll('.store.on').forEach(function(a){a.classList.remove('on')});
    var c=document.getElementById('st-'+id);if(c){c.classList.add('on');if(scroll)c.scrollIntoView({behavior:reduce?'auto':'smooth',block:'nearest'})}
  }

  /* ---------- modos ---------- */
  function byKindName(a,b){return KORDER[a.k]-KORDER[b.k]||a.name.localeCompare(b.name)}
  function refresh(){
    if(st.mode==='city')openCity(st.city,st.noticeTpl,true);
    else if(st.mode==='near')nearestFrom(st.origin,st.here,st.noticeTpl,true);
    else if(st.mode==='search')textSearch(st.q,true);
    else {render()}
  }
  function showAll(){st.mode='cities';st.city=null;st.here=null;st.items=[];st.sel=null;st.origin=null;render();goTo(HOME)}
  function openCity(m,tpl,keep){
    st.mode='city';st.city=m;st.sel=null;st.noticeTpl=tpl;if(!keep)st.limit=30;
    if(!tpl){st.origin=null;st.here=null}
    paintTypes(m.stores);
    var arr=m.stores.filter(okKind);
    arr.sort(st.origin&&st.origin.you?function(a,b){return km(st.origin,a)-km(st.origin,b)}:byKindName);
    st.items=arr;render();
    var n=m.stores.length,s=countKind(m.stores.filter(function(p){return p.k==='s'}));
    notice.innerHTML=tpl?tpl.replace('{n}',plural(arr.length,'ponto','pontos')):'<b>'+esc(m.n)+'</b> tem <b>'+plural(n,'ponto','pontos')+'</b> com Granpalatto'+(m.stores.some(function(p){return p.k==='s'})?', incluindo sorveterias.':'.');
    if(!keep)goTo(fitB(m.b,6));
  }
  function nearestFrom(origin,here,tpl,keep){
    st.mode='near';st.city=null;st.here=here||null;st.sel=null;st.noticeTpl=tpl;st.origin={lat:origin.lat,lng:origin.lng,you:true};if(!keep)st.limit=10;
    paintTypes(STORES);
    var arr=STORES.filter(okKind).map(function(p){return {p:p,d:km(st.origin,p)}}).sort(function(a,b){return a.d-b.d}).slice(0,200).map(function(x){return x.p});
    st.items=arr;render();
    if(arr.length)notice.innerHTML=tpl.replace('{c}',esc(arr[0].m.n)).replace('{d}',fmtKm(km(st.origin,arr[0])));
    if(!keep){var near=arr.slice(0,6);var b=boundsOf(near.concat([st.origin]));if(here)b=[Math.min(b[0],here.b[0]),Math.min(b[1],here.b[1]),Math.max(b[2],here.b[2]),Math.max(b[3],here.b[3])];goTo(fitB(b,8))}
  }
  function textSearch(raw,keep){
    var q=norm(raw);st.q=raw;
    var hits=STORES.filter(function(p){return okKind(p)&&(p._t||(p._t=norm(p.name+' '+p.hood+' '+p.addr))).indexOf(q)>-1});
    st.mode='search';st.city=null;st.here=null;st.sel=null;st.origin=null;if(!keep)st.limit=30;
    hits.sort(function(a,b){return a.m.n.localeCompare(b.m.n)||a.name.localeCompare(b.name)});
    paintTypes(STORES.filter(function(p){return p._t.indexOf(q)>-1}));
    st.items=hits;render();
    notice.innerHTML=hits.length?'<b>'+plural(hits.length,'resultado','resultados')+'</b> para "'+esc(raw)+'".':'Não encontramos "<b>'+esc(raw)+'</b>". Tente o nome da cidade por extenso ou use sua localização.';
    if(hits.length&&!keep)goTo(fitB(boundsOf(hits.slice(0,st.limit)),8));
  }
  function search(raw){
    var q=norm(raw);if(!q){showAll();return}
    var exact=MLIST.filter(function(m){return m.key===q}),pre=MLIST.filter(function(m){return m.key.indexOf(q)===0});
    var pickM=function(a){return a.filter(function(m){return m.stores.length})[0]||a[0]};
    var m=exact.length?pickM(exact):(q.length>=3&&pre.length?pickM(pre):null);
    if(m){if(m.stores.length)openCity(m,null);else nearestFrom({lat:m.c[1],lng:m.c[0]},m,'Ainda não temos ponto em <b>'+esc(m.n)+'</b>. O mais perto fica em <b>{c}</b>, a <b>{d}</b>.');return}
    STORES.forEach(function(p){if(!p._t)p._t=norm(p.name+' '+p.hood+' '+p.addr)});
    textSearch(raw);
  }

  /* ---------- busca e localização ---------- */
  var dl=document.getElementById('cities');
  HAS.slice().sort(function(a,b){return a.n.localeCompare(b.n)}).forEach(function(m){var o=document.createElement('option');o.value=m.n;dl.appendChild(o)});
  var input=document.getElementById('q');
  document.getElementById('search').addEventListener('submit',function(e){e.preventDefault();search(input.value)});
  input.addEventListener('change',function(){if(input.value&&HAS.some(function(m){return m.n===input.value}))search(input.value)});
  resetBtn.addEventListener('click',function(){input.value='';showAll()});

  function inRing(pt,r){var x=pt[0],y=pt[1],ins=false;for(var i=0,j=r.length-1;i<r.length;j=i++){var xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))ins=!ins}return ins}
  function muniAt(lat,lng){for(var i=0;i<MLIST.length;i++){var m=MLIST[i],b=m.b;if(lng<b[0]||lng>b[2]||lat<b[1]||lat>b[3])continue;for(var k=0;k<m.r.length;k++)if(inRing([lng,lat],m.r[k]))return m}return null}
  document.getElementById('locate').addEventListener('click',function(){
    if(!navigator.geolocation){notice.innerHTML='Seu navegador não informa a localização. Digite sua cidade acima.';return}
    notice.textContent='Procurando sua localização…';
    navigator.geolocation.getCurrentPosition(function(p){
      var o={lat:p.coords.latitude,lng:p.coords.longitude,you:true},m=muniAt(o.lat,o.lng);
      if(m&&m.stores.length){st.origin=o;st.here=m;openCity(m,'Você está em <b>'+esc(m.n)+'</b>, que tem <b>{n}</b>. Do mais perto pro mais longe:')}
      else nearestFrom(o,m,m?'Ainda não temos ponto em <b>'+esc(m.n)+'</b>. O mais perto de você fica em <b>{c}</b>, a <b>{d}</b>.':'O ponto mais perto de você fica em <b>{c}</b>, a <b>{d}</b>.');
    },function(){notice.innerHTML='Não conseguimos acessar sua localização. Digite sua cidade acima.'},{timeout:10000,maximumAge:600000});
  });

  /* início */
  function home(){HOME=fitB(mb(HAS),10)}
  home();view=clampV({x:HOME.x,y:HOME.y,w:HOME.w,h:HOME.h});commit();render();
  /* busca vinda da página inicial */
  var pre=null;try{pre=sessionStorage.getItem('gp-q');sessionStorage.removeItem('gp-q')}catch(e){}
  if(pre){input.value=pre;search(pre)}
  var rt;window.addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(function(){BR=null;var c={x:view.x+view.w/2,y:view.y+view.h/2},a=aspect(),h=view.w/a;view=clampV({x:view.x,y:c.y-h/2,w:view.w,h:h});home();commit()},120)});
})();
