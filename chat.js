/* Assistente de parceria: conversa guiada que indica o melhor modelo e leva pro WhatsApp do comercial. */
(function(){
  var root=document.getElementById('gp-chat');if(!root)return;
  var log=root.querySelector('.gc-log'),opts=root.querySelector('.gc-opts'),form=root.querySelector('.gc-form'),input=form.querySelector('input');
  var WA='5517981292496';
  var A={},score={sorv:0,freezer:0,quiosque:0},hist=[];
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function scroll(){log.scrollTop=log.scrollHeight}
  function bubble(html,me){var d=document.createElement('div');d.className='gc-msg'+(me?' me':'');d.innerHTML=html;log.appendChild(d);scroll();return d}
  function bot(lines,then){
    lines=[].concat(lines);var i=0;opts.innerHTML='';form.hidden=true;
    (function next(){
      if(i>=lines.length){then&&then();return}
      var t=document.createElement('div');t.className='gc-msg typing';t.innerHTML='<i></i><i></i><i></i>';log.appendChild(t);scroll();
      setTimeout(function(){t.remove();bubble(lines[i++]);next()},reduce?0:Math.min(1100,450+lines[i].length*9));
    })();
  }
  function ask(choices,cb){
    opts.innerHTML='';form.hidden=true;
    choices.forEach(function(c){var b=document.createElement('button');b.type='button';b.className='gc-opt';b.textContent=c[1];
      b.onclick=function(){opts.innerHTML='';bubble(esc(c[1]),true);hist.push(c[1]);cb(c[0],c[1])};opts.appendChild(b)});
    scroll();
  }
  function askText(ph,cb,optional){
    opts.innerHTML='';form.hidden=false;input.value='';input.placeholder=ph;
    if(window.innerWidth>820)input.focus();
    form.onsubmit=function(e){e.preventDefault();var v=input.value.trim();if(!v&&!optional)return;form.hidden=true;input.blur();
      if(v)bubble(esc(v),true);cb(v)};
  }

  /* ---------- roteiro ---------- */
  function start(){
    log.innerHTML='';A={};hist=[];score={sorv:0,freezer:0,quiosque:0};
    bot(['Oi! Eu ajudo você a descobrir o melhor jeito de trabalhar com a Granpalatto. 🍦','São só algumas perguntas rápidas. Como posso te chamar?'],function(){
      askText('Seu nome',function(v){A.nome=v;q1()})
    });
  }
  function q1(){
    bot('Prazer, '+esc(A.nome.split(' ')[0])+'! Você já tem um comércio funcionando?',function(){
      ask([['sim','Sim, já tenho um comércio'],['nao','Não, quero começar um negócio']],function(k){A.tem=k;k==='sim'?q2a():q3()})
    });
  }
  function q2a(){
    bot('Legal! Que tipo de comércio é o seu?',function(){
      ask([['mercado','Mercado ou mercearia'],['padaria','Padaria'],['rest','Restaurante, lanchonete ou bar'],['sorv','Sorveteria ou açaiteria'],['outro','Outro tipo']],function(k,l){
        A.tipo=l;A.onde={mercado:'do seu mercado',padaria:'da sua padaria',rest:'do seu restaurante',outro:'do seu comércio'}[k];
        if(k==='sorv'){score.sorv+=4;A.jaSorv=true;q5()}
        else q2b();
      })
    });
  }
  function q2b(){
    bot('E o que você tem em mente?',function(){
      ask([['prod','Vender sorvete como mais um produto do meu comércio'],['loja','Abrir um espaço só de sorvete']],function(k){
        if(k==='prod'){score.freezer+=5;q6()}else{score.sorv+=1;q3()}
      })
    });
  }
  function q3(){
    bot('Onde você imagina o seu ponto?',function(){
      ask([['rua','Na rua, no centro da cidade'],['bairro','Num bairro'],['shop','Em shopping ou galeria'],['nsei','Ainda não sei']],function(k,l){
        A.local=l;if(k==='shop')score.quiosque+=3;if(k==='rua'||k==='bairro')score.sorv+=1;q4()
      })
    });
  }
  function q4(){
    bot('Qual tamanho de operação combina mais com você?',function(){
      ask([['compacto','Algo compacto, pra começar menor'],['completo','Uma loja completa, com mesas e cardápio variado'],['nsei','Ainda estou avaliando']],function(k,l){
        A.porte=l;if(k==='compacto')score.quiosque+=2;if(k==='completo')score.sorv+=3;q5()
      })
    });
  }
  function q5(){
    bot('E sobre a marca: como você prefere?',function(){
      ask([['gp','Quero usar a marca Granpalatto'],['minha','Quero ter a minha própria marca'],['tanto','Tanto faz, quero o que der mais certo']],function(k,l){
        A.marca=k;A.marcaL=l;if(k==='minha')score.sorv+=2;if(k==='gp')score.quiosque+=1;q6()
      })
    });
  }
  function q6(){
    bot('Última: em qual cidade você está?',function(){
      askText('Sua cidade',function(v){A.cidade=v;var ins=insight(v);A.cidadeInfo=ins.resumo;bot(ins.msgs,result)})
    });
  }

  /* ---------- a cidade da pessoa (sempre com um lado positivo) ---------- */
  function norm(s){return (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()}
  function findCity(v){
    var C=window.GP_CIDADES||{},k=norm(v).replace(/ (sp|mg|sao paulo|minas gerais)$/,'').trim();
    if(C[k])return C[k];
    var hits=Object.keys(C).filter(function(x){return x.indexOf(k)===0});
    return hits.length===1&&k.length>=4?C[hits[0]]:null;
  }
  function nf(n){return n.toLocaleString('pt-BR')}
  function insight(v){
    var c=findCity(v),name=c?c[0]:v.trim().replace(/\s+/g,' ').toLowerCase().split(' ').map(function(w,i){return i&&/^(de|da|do|das|dos|e)$/.test(w)?w:w.charAt(0).toUpperCase()+w.slice(1)}).join(' '),n=c?c[2]:0,b=c?c[3]:0,nm='<b>'+esc(name)+'</b>';
    if(c)A.cidade=c[0]+' - '+c[1];
    if(!n)return {resumo:'ainda sem ponto Granpalatto',msgs:['Em '+nm+' ainda não tem nenhum ponto Granpalatto. Isso é ótimo: você chega como <b>novidade</b> e pode ser a referência da marca na cidade. 🚀']};
    if(n<=5)return {resumo:n+(n>1?' pontos':' ponto'),msgs:[nm+' tem só <b>'+n+(n>1?' pontos':' ponto')+'</b> com Granpalatto. A marca ainda é novidade por aí, ou seja, tem muito espaço pra você crescer. 📈']};
    if(n<=40)return {resumo:n+' pontos',msgs:[nm+' já tem <b>'+n+' pontos</b> com Granpalatto. O pessoal já conhece a marca, e ainda tem bastante espaço pra pontos novos. 👍']};
    return {resumo:nf(n)+' pontos em '+b+' bairros',msgs:[nm+' é uma das cidades onde a Granpalatto é mais forte: <b>'+nf(n)+' pontos</b> em '+b+' bairros. 💪','Seu cliente já conhece e procura a marca, então você começa com a demanda pronta. E sempre tem bairro esperando um ponto novo: o comercial te mostra as regiões com mais espaço.']};
  }

  /* ---------- resultado ---------- */
  var MODELS={
    sorv:{t:'Sorveteria parceira',k:'Abra sua sorveteria',
      why:function(){var w=[];
        if(A.jaSorv)w.push('Você já tem uma sorveteria: a Granpalatto entra com os produtos, os freezers e o treinamento, e a marca da loja pode continuar sendo a sua.');
        else if(A.marca==='minha')w.push('Você pode abrir com a sua própria marca. A parceria é nos produtos, nos freezers e no treinamento.');
        else w.push('Você pode abrir sua sorveteria com a marca Granpalatto ou com a sua.');
        w.push('Sem royalties, com treinamento pra família toda e a fábrica abastecendo a sua loja.');
        w.push('Investimento a partir de R$ 60 mil, com mobiliário e equipamentos.');return w}},
    freezer:{t:'Freezer Granpalatto no seu comércio',k:'Nossos produtos no seu estabelecimento',
      why:function(){return ['Você coloca os sorvetes Granpalatto dentro '+(A.onde||'do seu comércio')+' e aumenta o ticket médio sem mudar a operação.','Os picolés, potes e copos que o seu cliente já conhece, com reposição feita pela fábrica.']}},
    quiosque:{t:'Quiosque Granpalatto',k:'A novidade da Granpalatto',
      why:function(){var w=['Um formato com a nossa marca e os nossos produtos, que é a novidade da Granpalatto.'];
        if(A.local&&/shopping/i.test(A.local))w.push('Pelo que você contou, pode ser um bom caminho pro ponto que você imagina. O time comercial confirma se o seu local se encaixa.');
        else w.push('O time comercial te explica como funciona e se o seu local se encaixa.');return w}}
  };
  function best(){var o=['sorv','quiosque','freezer'].sort(function(a,b){return score[b]-score[a]});return o[0]}
  function result(){
    var key=best(),m=MODELS[key],first=A.nome.split(' ')[0];
    var msg='Olá! Fiz o teste de parceria no site da Granpalatto.\n'+
      'Nome: '+A.nome+'\nCidade: '+(A.cidade||'-')+(A.cidadeInfo?' ('+A.cidadeInfo+')':'')+'\nIndicação: '+m.t+'\n\nMinhas respostas:\n- '+hist.join('\n- ');
    var href='https://api.whatsapp.com/send?phone='+WA+'&text='+encodeURIComponent(msg);
    bot(['Pronto, '+esc(first)+'! Analisei suas respostas.'],function(){
      var d=bubble('<span class="gc-k">Indicação pra você</span><strong class="gc-t">'+esc(m.t)+'</strong><ul>'+m.why().map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul>'+
        '<a class="gc-wa" href="'+href+'" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.05 2a9.9 9.9 0 0 0-8.5 15L2 22l5.1-1.5A9.9 9.9 0 1 0 12.05 2zm5.4 13.9c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.7-.1a15 15 0 0 1-1.6-.6 12 12 0 0 1-4.6-4c-.4-.5-1-1.5-1-2.8s.7-2 1-2.3c.2-.3.5-.4.7-.4h.5c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.2-.3.3-.1.6.2.3.7 1.2 1.6 1.9 1 .9 1.9 1.2 2.2 1.3.3.1.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l2 .9c.3.2.5.2.5.4.1.1.1.7-.1 1.2z"/></svg>Falar com o comercial no WhatsApp</a>');
      d.classList.add('gc-result');log.scrollTop=Math.max(0,d.offsetTop-log.offsetTop-12);
      setTimeout(function(){var top=log.scrollTop;ask([['re','Refazer o teste']],function(){start()});log.scrollTop=top},reduce?0:400);
    });
  }

  /* começa assim que a página carrega (funciona também em prévias e iframes) */
  var started=false;
  function go(){if(!started){started=true;try{start()}catch(e){started=false}}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go();
  root.addEventListener('click',go);
  document.querySelectorAll('[data-chat]').forEach(function(a){a.addEventListener('click',go)});
})();
