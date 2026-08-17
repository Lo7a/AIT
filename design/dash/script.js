/* משותף לכל העמודים: תצוגה כהה/בהירה, חשיפה מדורגת, ספירת מספרים */
(function(){
  var reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* מתג תצוגה - נשמר בדפדפן, חל על כל העמודים */
  document.querySelectorAll(".theme-tgl").forEach(function(b){
    b.addEventListener("click",function(){
      var d=document.documentElement;
      var next=d.getAttribute("data-theme")==="light"?"dark":"light";
      if(next==="light"){d.setAttribute("data-theme","light");}
      else{d.removeAttribute("data-theme");}
      try{localStorage.setItem("ait-theme",next);}catch(e){}
    });
  });

  function countUp(el){
    var target=parseInt(el.getAttribute("data-count"),10);
    if(reduced){el.textContent=target;return;}
    var t0=null,dur=1400;
    function tick(ts){
      if(!t0)t0=ts;
      var p=Math.min((ts-t0)/dur,1);
      var eased=1-Math.pow(1-p,4);
      el.textContent=Math.round(target*eased);
      if(p<1)requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      document.documentElement.classList.add("loaded");
      document.querySelectorAll("[data-count]").forEach(countUp);
    });
  });
})();
