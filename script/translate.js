'use strict'
function sinh(x) { return 0.5*(Math.exp(x)-Math.exp(-x)) }
function cosh(x) { return 0.5*(Math.exp(x)+Math.exp(-x)) }
function arctanh(x) { return 0.5*Math.log((1+x)/(1-x)) }
let a=6378137 ;
let rf=298.257222101 ;
let m0=0.9999 ;
let s2r=Math.PI/648000 ;
let n=0.5/(rf-0.5)
let n15=1.5*n ;
let anh=0.5*a/(1+n) ;
let nsq=n*n
let e2n=2*Math.sqrt(n)/(1+n) ;
let ra=2*anh*m0*(1+nsq/4+nsq*nsq/64);
let jt=5 ;
let jt2=2*jt ;
var ep=1.0 ;
var e=[] ;
var s=[0.0] ;
var t=[] ;
var alp=[];
for(var k=1; k<=jt; k++) { ep*=e[k]=n15/k-n ; e[k+jt]=n15/(k+jt)-n }
// 展開パラメータの事前入力
alp[1]=(1/2+(-2/3+(5/16+(41/180-127/288*n)*n)*n)*n)*n
alp[2]=(13/48+(-3/5+(557/1440+281/630*n)*n)*n)*nsq
alp[3]=(61/240+(-103/140+15061/26880*n)*n)*n*nsq
alp[4]=(49561/161280-179/168*n)*nsq*nsq
alp[5]=34729/80640*n*nsq*nsq
// 平面直角座標の座標系原点の緯度を度単位で、経度を分単位で格納
var phi0=[0,33,33,36,33,36,36,36,36,36,40,44,44,44,26,26,26,26,20,26]
var lmbd0=[0,7770,7860,7930,8010,8060,8160,8230,8310,8390,8450,8415,8535,8655,8520,7650,7440,7860,8160,9240]
// 該当緯度の 2 倍角の入力により赤道からの子午線弧長を求める関数
function Merid(phi2) {
 var dc=2.0*Math.cos(phi2) ; s[1]=Math.sin(phi2)
 for(var i=1; i<=jt2; i++) { s[i+1]=dc*s[i]-s[i-1] ; t[i]=(1.0/i-4.0*i)*s[i] }
 var sum=0.0 ;
 var c1=ep ; 
 var j=jt
 while(j) {
 var c2=phi2 ;
 var c3=2.0 ; 
 var l=j ; 
 var m=0
 while(l) { c2+=(c3/=e[l--])*t[++m]+(c3*=e[2*j-l])*t[++m] }
 sum+=c1*c1*c2 ; c1/=e[j--]
 }
 return anh*(sum+phi2)
}
// 与件入力→関数にする。num座標系番号、lat緯度(少数点表記)、lng経度(少数点表記)
function translate_latlng_coord(num,lat,lng){

var phirad=(lat*3600)*s2r
var lmbdsec=lng*3600
// 実際の計算実行部分
let sphi=Math.sin(phirad) ; 
let nphi=(1-n)/(1+n)*Math.tan(phirad);
let dlmbd=(lmbdsec-lmbd0[num]*60)*s2r;
let sdlmbd=Math.sin(dlmbd) ; 
let cdlmbd=Math.cos(dlmbd);
let tchi=sinh(arctanh(sphi)-e2n*arctanh(e2n*sphi)) ; 
let cchi=Math.sqrt(1+tchi*tchi);
var xi=Math.atan2(tchi, cdlmbd) ;
let xip=Math.atan2(tchi, cdlmbd) ;
var alsin =0;
var alcos =0;
var eta=arctanh(sdlmbd/cchi) ; 
var etap=arctanh(sdlmbd/cchi) ; 
var sgm=1;
var tau=0;
var x = 0;
var y =0;
for(var j=alp.length; --j; ) {
 alsin=alp[j]*Math.sin(2*j*xip) ;
 alcos=alp[j]*Math.cos(2*j*xip);
 xi+=alsin*cosh(2*j*etap) ; 
 eta+=alcos*sinh(2*j*etap);
 sgm+=2*j*alcos*cosh(2*j*etap) ;
tau+=2*j*alsin*sinh(2*j*etap)
}
x=ra*xi-m0*Merid(2*phi0[num]*3600*s2r) ; 
y=ra*eta
var gmm=Math.atan2(tau*cchi*cdlmbd+sgm*tchi*sdlmbd, sgm*cchi*cdlmbd-tau*tchi*sdlmbd)
var m=ra/a*Math.sqrt((sgm*sgm+tau*tau)/(tchi*tchi+cdlmbd*cdlmbd)*(1+nphi*nphi))
// ラジアン → 度分秒変換
var sgn=(gmm<0)
var gdo=Math.floor(gmm/s2r/3600)+sgn
var gfun=Math.floor((gmm/s2r-gdo*3600)/60)+sgn
var gbyou=gmm/s2r-gdo*3600-gfun*60

    console.log("Ｘ＝" + x + "，Ｙ＝" + y)
    console.log("γ＝" + (sgn?"－":"＋") + Math.abs(gdo) + "°" + Math.abs(gfun) + "′"
     + Math.abs(gbyou) + "″，m＝" + m )

return [x,y]
}
// 結果表示
