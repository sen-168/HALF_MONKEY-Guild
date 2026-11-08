(() => {
  "use strict";

  let deferredPrompt = null;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  if (isStandalone || localStorage.getItem("hmPwaInstallDismissed") === "1") return;

  const style = document.createElement("style");
  style.textContent = `
    #hmPwaInstall {
      position: fixed;
      z-index: 99999;
      right: max(14px, env(safe-area-inset-right));
      bottom: max(14px, env(safe-area-inset-bottom));
      display: flex;
      align-items: center;
      gap: 9px;
      max-width: min(330px, calc(100vw - 28px));
      padding: 10px 12px;
      border: 1px solid rgba(233,201,138,.75);
      border-radius: 14px;
      background: linear-gradient(135deg, rgba(31,13,48,.97), rgba(8,13,31,.97));
      color: #fff7ff;
      box-shadow: 0 8px 28px rgba(0,0,0,.4);
      font: 500 13px/1.35 Kanit, sans-serif;
    }
    #hmPwaInstall .hm-pwa-icon {
      width: 34px; height: 34px; flex: 0 0 34px;
      border-radius: 9px; object-fit: cover;
    }
    #hmPwaInstall .hm-pwa-copy { flex: 1; min-width: 0; }
    #hmPwaInstall .hm-pwa-copy strong { display:block; color:#e9c98a; font-size:13px; }
    #hmPwaInstall button {
      border: 0; border-radius: 9px; padding: 8px 10px;
      background: #e9c98a; color: #180d24;
      font: 700 12px Kanit, sans-serif; white-space: nowrap; cursor: pointer;
    }
    #hmPwaInstall .hm-pwa-close {
      align-self: flex-start; padding: 0 3px; background: transparent;
      color: #cbbbd8; font-size: 18px; line-height: 1;
    }
    @media (max-width: 380px) {
      #hmPwaInstall { right: 8px; bottom: max(8px, env(safe-area-inset-bottom)); }
      #hmPwaInstall .hm-pwa-copy { font-size: 11px; }
    }
  `;
  document.head.appendChild(style);

  const wrap = document.createElement("aside");
  wrap.id = "hmPwaInstall";
  wrap.setAttribute("aria-label", "ติดตั้งแอป HALF MONKEY");
  wrap.innerHTML = `
    <img class="hm-pwa-icon" src="/assets/half-monkey-icon.svg" alt="">
    <div class="hm-pwa-copy"><strong>HALF MONKEY APP</strong><span>เพิ่มแอปไว้บนหน้าจอมือถือ</span></div>
    <button type="button" class="hm-pwa-action">ติดตั้ง</button>
    <button type="button" class="hm-pwa-close" aria-label="ปิด">×</button>
  `;
  document.body.appendChild(wrap);

  const action = wrap.querySelector(".hm-pwa-action");
  const close = () => {
    wrap.remove();
    localStorage.setItem("hmPwaInstallDismissed", "1");
  };
  wrap.querySelector(".hm-pwa-close").addEventListener("click", close);

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event;
  });

  action.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      wrap.remove();
      return;
    }

    if (isIOS) {
      alert("วิธีติดตั้ง HALF MONKEY บน iPhone:\n1. เปิดเว็บไซต์นี้ด้วย Safari\n2. กดปุ่มแชร์ (สี่เหลี่ยมมีลูกศรขึ้น)\n3. เลือก Add to Home Screen / เพิ่มไปยังหน้าจอโฮม\n4. กด Add / เพิ่ม");
      return;
    }

    alert("หากไม่เห็นหน้าต่างติดตั้ง ให้เปิดเมนูของเบราว์เซอร์ แล้วเลือก Install app หรือ Add to Home screen");
  });

  window.addEventListener("appinstalled", () => wrap.remove());
})();
