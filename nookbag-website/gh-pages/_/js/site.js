!function(){"use strict";var n=document.querySelector(".navigation-container"),t=document.querySelector(".navigation-toggle");t.addEventListener("click",function(e){if(t.classList.contains("is-active"))return v(e);document.documentElement.classList.add("is-clipped--nav"),t.classList.add("is-active"),n.classList.add("is-active"),window.addEventListener("click",v),f(e)}),n.addEventListener("click",f);var e,i,a,s,c,o,r,l,d,u=n.querySelector("[data-panel=menu]");function v(e){3!==e.which&&2!==e.button&&(document.documentElement.classList.remove("is-clipped--nav"),t.classList.remove("is-active"),n.classList.remove("is-active"),window.removeEventListener("click",v),f(e))}function f(e){e.stopPropagation()}function m(){return g(".is-active",u).map(function(e){return e.dataset.id})}function p(){window.sessionStorage.setItem("nav-state",JSON.stringify(e))}function g(e,t){return[].slice.call((t||document).querySelectorAll(e))}u&&(e=(i=window.sessionStorage.getItem("nav-state"))&&"1"===(i=JSON.parse(i)).__version__?i:{__version__:"1"},s=e,c=n.dataset.component,o=n.dataset.version,a=s[r=o+"@"+c]||(s[r]={}),n.querySelector(".context").addEventListener("click",function(){var e=n.querySelector(".is-active[data-panel]"),t="menu"===e.dataset.panel?"explore":"menu";e.classList.toggle("is-active"),n.querySelector("[data-panel="+t+"]").classList.toggle("is-active")}),g(".nav-toggle",u).forEach(function(e){var t=e.parentElement;e.addEventListener("click",function(){t.classList.toggle("is-active"),a.expandedItems=m(),p()});var n=function(e,t){var n;if("nextElementSibling"in e)n=e.nextElementSibling;else for(n=e;(n=n.nextSibling)&&1!==n.nodeType;);return(!n||!t||n[n.matches?"matches":"msMatchesSelector"](t))&&n}(e,".nav-text");n&&(n.style.cursor="pointer",n.addEventListener("click",function(){t.classList.toggle("is-active"),a.expandedItems=m(),p()}))}),g(".nav-item",u).forEach(function(e,t){e.setAttribute("data-id","menu-"+e.dataset.depth+"-"+t)}),(l=a.expandedItems||(a.expandedItems=[])).length&&g(l.map(function(e){return'.nav-item[data-id="'+e+'"]'}).join(","),u).forEach(function(e){e.classList.add("is-active")}),(d=u.querySelector(".is-current-page"))&&function(e){var t,n=[e.dataset.id],i=e.parentNode;for(;!(t=i.classList).contains("nav-menu");)"LI"===i.tagName&&t.contains("nav-item")&&(t.add("is-active","is-current-path"),n.push(i.dataset.id)),i=i.parentNode;return e.classList.add("is-active"),n}(d).forEach(function(e){l.indexOf(e)<0&&l.push(e)}),p(),function(e,t,n){if(!n)return t.scrollTop=e;var i=n.offsetTop;i<e?t.scrollTop=i-10:i-t.offsetHeight+n.offsetHeight>e?t.scrollTop=i-t.offsetHeight+n.offsetHeight+10:t.scrollTop=e}(a.scroll||0,u,d&&d.querySelector(".nav-link")),u.addEventListener("scroll",function(){a.scroll=Math.round(u.scrollTop),p()}))}();
!function(){"use strict";var o=document.querySelector("article.doc"),t=document.querySelector(".toolbar");function i(e){e&&(window.location.hash="#"+this.id,e.preventDefault()),window.scrollTo(0,function e(t,n){return o.contains(t)?e(t.offsetParent,t.offsetTop+n):n}(this,0)-t.getBoundingClientRect().bottom)}window.addEventListener("load",function e(t){var n,o;(n=window.location.hash)&&(o=document.getElementById(n.slice(1)))&&(i.bind(o)(),setTimeout(i.bind(o),0)),window.removeEventListener("load",e)}),Array.prototype.slice.call(document.querySelectorAll('a[href^="#"]')).forEach(function(e){var t,n;(t=e.hash.slice(1))&&(n=document.getElementById(t))&&e.addEventListener("click",i.bind(n))})}();
!function(){"use strict";var t,e=document.querySelector(".page-versions .versions-menu-toggle");e&&(t=document.querySelector(".page-versions"),e.addEventListener("click",function(e){t.classList.toggle("is-active"),e.stopPropagation()}),window.addEventListener("click",function(){t.classList.remove("is-active")}))}();
document.addEventListener("DOMContentLoaded",function(){var t=Array.prototype.slice.call(document.querySelectorAll(".navbar-burger"),0);0!==t.length&&t.forEach(function(e){e.addEventListener("click",function(t){t.stopPropagation(),e.classList.toggle("is-active"),document.getElementById(e.dataset.target).classList.toggle("is-active"),document.documentElement.classList.toggle("is-clipped--navbar")})})});
!function(){"use strict";var l=window.location.hash;function o(t,a){return Array.prototype.slice.call((a||document).querySelectorAll(t))}o(".tabset").forEach(function(c){var n,r,t=c.querySelector(".tabs");t&&(o("li",t).forEach(function(t,a){var e,i,s=(t.querySelector("a[id]")||t).id;s&&(i=s,e=o(".tab-pane",c).find(function(t){return t.getAttribute("aria-labelledby")===i}),a||(r={tab:t,pane:e}),!n&&l==="#"+s&&(n=!0)?(t.classList.add("is-active"),e&&e.classList.add("is-active")):a||(t.classList.remove("is-active"),e&&e.classList.remove("is-active")),t.addEventListener("click",function(t){var a=this.tab,e=this.pane;o(".tabs li, .tab-pane",this.tabset).forEach(function(t){t===a||t===e?t.classList.add("is-active"):t.classList.remove("is-active")}),t.preventDefault()}.bind({tabset:c,tab:t,pane:e})))}),!n&&r&&(r.tab.classList.add("is-active"),r.pane&&r.pane.classList.add("is-active"))),c.classList.remove("is-loading")})}();
!function(){"use strict";var o=new ClipboardJS(".copybtn");o.on("success",function(o){}),o.on("error",function(o){console.error("Action:",o.action),console.error("Trigger:",o.trigger)})}();