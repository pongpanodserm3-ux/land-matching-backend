<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Land Matching AI</title>
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <!-- เพิ่ม Supabase JS -->
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <style>
    :root {
      --text-main: #5c3a6b;
      --text-dark: #333333;
      --bg-gradient: linear-gradient(135deg, #ffd1df 0%, #c4f5e9 100%);
      --btn-green: #bcece0;
      --btn-blue: #4a83cc;
    }

    body {
      font-family: 'Arial', sans-serif;
      margin: 0;
      padding: 0;
      background: #fdfbfb;
      color: var(--text-dark);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    /* --- ปุ่ม คุยกับ AI (Global / Topmost Layer / Floating Top-Right) --- */
    .voice-btn {
      position: fixed !important;
      top: 15px !important;
      right: 15px !important;
      z-index: 1000000 !important;
      flex: 0 0 auto;
      height: 44px;
      padding: 6px 16px;
      font-size: 13px;
      font-weight: bold;
      border-radius: 22px;
      cursor: pointer;
      white-space: nowrap;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.4);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      border: 1px solid rgba(255, 255, 255, 0.6);
      backdrop-filter: blur(5px);
      background: linear-gradient(135deg, #4a83cc 0%, #2b5893 100%);
      color: white;
    }
    .voice-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(74, 131, 204, 0.35);
    }
    .voice-btn.active {
      background: linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%);
      box-shadow: 0 0 15px rgba(255, 65, 108, 0.6);
    }

    /* --- ส่วนบน: AI Voice & Tabs Container --- */
    #ai-section {
      height: auto;
      min-height: 250px;
      max-height: 50vh;
      background: var(--bg-gradient);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: 15px 15px 15px 15px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
      z-index: 10;
      border-radius: 0 0 30px 30px;
      flex-shrink: 0;
      transition: min-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), padding 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    #ai-section.collapsed {
      min-height: 0 !important;
      padding-bottom: 10px;
    }

    /* --- บรรทัดที่ 1: ส่วนหัว --- */
    .ai-controls-row {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      margin-bottom: 12px;
      position: relative;
    }

    .header-center-logos {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      gap: 8px;
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
    }

    /* ปรับแต่งปุ่มพิกัดให้มีขนาดพอดีกับข้อความ */
    #locationFilterBtn {
      flex: 0 0 auto;
      height: 44px;
      padding: 6px 16px;
      font-size: 13px;
      font-weight: bold;
      border-radius: 22px;
      cursor: pointer;
      white-space: nowrap;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.4);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      border: 1px solid rgba(255, 255, 255, 0.6);
      backdrop-filter: blur(5px);
      background: linear-gradient(135deg, #0e6b38 0%, #159947 100%);
      color: #ffffff;
    }
    #locationFilterBtn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(14, 107, 56, 0.35);
    }
    #locationFilterBtn:active {
      transform: translateY(0);
      background-color: #0a522a;
    }

    .mascot-img { 
      height: 48px;
      object-fit: contain; 
    }
    
    .ai-avatar {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: #fff;
      border: 3px solid var(--btn-blue);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.1);
      transition: all 0.3s ease;
      flex-shrink: 0;
    }
    
    .pulse-animation { 
      animation: pulse 1.5s infinite;
      border-color: #ff6b81; 
    }
    @keyframes pulse {
      0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 107, 129, 0.7); }
      70% { transform: scale(1.05); box-shadow: 0 0 0 15px rgba(255, 107, 129, 0); }
      100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 107, 129, 0); }
    }

    /* --- แถบระบบนำทาง 4 แท็บ --- */
    .tabs-nav {
      display: flex;
      flex-direction: row;
      width: 100%;
      background: rgba(255, 255, 255, 0.6);
      border-radius: 18px;
      padding: 4px;
      margin-bottom: 12px;
      border: 1px solid rgba(74, 131, 204, 0.25);
      backdrop-filter: blur(10px);
      box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.06), 0 3px 10px rgba(0, 0, 0, 0.05);
      overflow-x: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
      box-sizing: border-box;
      gap: 2px;
    }
    .tabs-nav::-webkit-scrollbar { display: none; }

    .tab-btn {
      flex: 1;
      min-width: 80px;
      padding: 9px 6px;
      background: transparent;
      border: none;
      border-radius: 14px;
      color: #666666;
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
      text-align: center;
      white-space: nowrap;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      outline: none;
    }

    .tab-btn:hover {
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.4);
    }

    .tab-btn.active {
      background: #ffffff;
      color: var(--btn-blue);
      font-weight: 800;
      box-shadow: 0 3px 10px rgba(74, 131, 204, 0.22), 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .tab-btn.active::after {
      content: '';
      position: absolute;
      bottom: 3px;
      left: 20%;
      width: 60%;
      height: 3px;
      background: var(--btn-blue);
      border-radius: 3px;
    }

    .tab-content {
      width: 100%;
      max-height: 400px;
      opacity: 1;
      overflow: hidden;
      transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, margin 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    #ai-section.collapsed .tab-content {
      max-height: 0;
      opacity: 0;
      margin: 0;
    }

    /* --- โครงสร้างเนื้อหาภายในแท็บ --- */
    .input-status-row {
      display: flex;
      flex-direction: row;
      align-items: center;
      width: 100%;
      margin: 4px 0 8px 0;
      gap: 6px;
    }
    
    .custom-edit {
      flex: 1;
      padding: 10px 12px;
      font-size: 15px;
      border: 1px solid var(--btn-blue);
      border-radius: 12px;
      box-sizing: border-box;
      background: #ffffff;
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.05);
    }

    #statusText { 
      font-size: 12px; 
      color: #555; 
      font-weight: bold; 
      flex: 1;
      text-align: right; 
      line-height: 1.2;
    }

    .loading-pulse {
      animation: loadingAnim 1.5s infinite ease-in-out;
      color: var(--btn-blue) !important;
    }
    @keyframes loadingAnim {
      0% { opacity: 0.4; transform: scale(0.98); }
      50% { opacity: 1; transform: scale(1.02); }
      100% { opacity: 0.4; transform: scale(0.98); }
    }

    .filter-scroll-row {
      display: flex;
      flex-direction: row;
      overflow-x: auto;
      gap: 6px;
      width: 100%;
      padding: 6px 2px;
      margin-bottom: 6px;
      -ms-overflow-style: none;
      scrollbar-width: none;
    }
    .filter-scroll-row::-webkit-scrollbar { display: none; }
    
    .filter-btn {
      background: #ffffff;
      border: 1px solid var(--btn-blue);
      color: var(--btn-blue);
      border-radius: 18px;
      padding: 6px 12px;
      font-size: 14px;
      font-weight: bold;
      white-space: nowrap;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      transition: all 0.2s;
    }
    .filter-btn:active { background: var(--btn-blue); color: #fff; }

    .action-show-list-btn {
      background: #ffdfba;
      border: 1px solid #f7c99b;
      padding: 10px 16px;
      border-radius: 12px;
      font-weight: bold;
      cursor: pointer;
      font-size: 15px;
      color: #333;
      box-shadow: 0 2px 6px rgba(0,0,0,0.08);
      transition: all 0.2s;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .action-show-list-btn:active {
      transform: scale(0.98);
      background: #f7c99b;
    }

    .empty-tab-box {
      background: rgba(255, 255, 255, 0.7);
      border-radius: 16px;
      padding: 25px 15px;
      text-align: center;
      color: #777;
      font-size: 14px;
      border: 1px dashed var(--btn-blue);
      margin-top: 5px;
    }

    /* --- ส่วนล่าง: List View & Card Custom Layout --- */
    #list-section {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      background-color: #ffffff;
    }

    .card-flex-container {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: stretch;
      gap: 12px;
    }
    .card-info-left {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .card-media-right {
      width: 145px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
    }
    .card-img-slider {
      width: 100%;
      height: 100px;
      display: flex;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      gap: 6px;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      -ms-overflow-style: none;
      scrollbar-width: none;
      background: #f8fafc;
    }
    .card-img-slider::-webkit-scrollbar {
      display: none;
    }
    .card-img-slider img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 10px;
      scroll-snap-align: start;
      flex-shrink: 0;
      background: #f0f0f0;
    }

    /* ปุ่มคุยกับเจ้าของ (เขียวพาสเทล ไฮเทค) [คำสั่งที่ 2] */
    .btn-chat-owner {
      background: linear-gradient(135deg, #a8e6cf 0%, #81c784 100%);
      color: #1b4332;
      border: 1px solid #81c784;
      padding: 6px 12px;
      border-radius: 18px;
      font-size: 11px;
      font-weight: bold;
      cursor: pointer;
      box-shadow: 0 3px 8px rgba(129, 199, 132, 0.4), inset 0 1px 0 rgba(255,255,255,0.6);
      transition: all 0.25s ease;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }
    .btn-chat-owner:hover {
      transform: translateY(-1px);
      box-shadow: 0 5px 12px rgba(129, 199, 132, 0.6);
      background: linear-gradient(135deg, #b9f2dc 0%, #92d895 100%);
    }
    .btn-chat-owner:active {
      transform: translateY(0);
    }

    /* --- Modal --- */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background-color: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(5px);
      display: none; justify-content: center;
      align-items: flex-end;
      z-index: 9000;
    }
    .modal-overlay.active { display: flex !important; }
    
    .detail-modal {
      background: #fff;
      width: 100%;
      height: 85vh;
      border-radius: 30px 30px 0 0;
      padding: 20px; box-sizing: border-box;
      display: flex; flex-direction: column;
      position: relative;
    }
    
    .dropdown-modal {
      background: #fff;
      width: 90%;
      max-width: 420px;
      border-radius: 20px;
      padding: 20px; box-sizing: border-box;
      display: flex; flex-direction: column;
      position: relative;
      margin: auto;
    }
    
    .dropdown-search-input {
      width: 100%;
      padding: 12px;
      font-size: 16px;
      border: 1px solid var(--btn-blue);
      border-radius: 10px;
      box-sizing: border-box;
      margin-top: 0;
      margin-bottom: 5px;
    }
    .dropdown-search-input:focus {
      outline: none;
      box-shadow: 0 0 5px rgba(74, 131, 204, 0.5);
    }

    .dropdown-options-container {
      display: flex;
      flex-direction: column; gap: 6px;
      margin-top: 10px; max-height: 45vh; overflow-y: auto;
    }
    .dropdown-option-btn {
      background: #f0f4f8; border: none; padding: 12px;
      border-radius: 10px;
      text-align: left; font-size: 20px;
      cursor: pointer; transition: background 0.2s;
    }
    .dropdown-option-btn:active { background: #d0e0f0; }

    .close-modal {
      position: absolute; top: 15px; right: 20px;
      font-size: 20px;
      color: #888; cursor: pointer; font-weight: bold;
      line-height: 1;
    }

    .image-slider {
      display: flex;
      overflow-x: auto; scroll-snap-type: x mandatory;
      gap: 6px; padding-bottom: 10px; margin-top: 10px;
    }
    .image-slider::-webkit-scrollbar { height: 6px; }
    .image-slider::-webkit-scrollbar-thumb { background: #ccc; border-radius: 10px; }
    .image-slider img {
      width: 85%; height: 200px; object-fit: cover;
      border-radius: 15px;
      scroll-snap-align: center; flex-shrink: 0;
      background: #eee;
    }

    .detail-content { flex: 1; overflow-y: auto; margin-top: 8px; }
    .detail-title { font-size: 22px; font-weight: bold; color: var(--text-main); }
    .detail-price { font-size: 20px; font-weight: bold; color: #d9534f; }
    
    .ai-detail-box {
      background: #e6f2ff;
      border-radius: 15px; padding: 15px;
      margin-top: 8px; display: flex; align-items: center; gap: 10px;
    }

    #modalDesc::-webkit-scrollbar { width: 6px; }
    #modalDesc::-webkit-scrollbar-thumb { background: #ccc; border-radius: 10px; }

    /* --- Infinite Scroll & Fallback UI --- */
    .infinite-loader {
      text-align: center;
      padding: 15px;
      font-weight: bold;
      color: var(--btn-blue);
      display: none;
    }
    .fallback-retry-card {
      text-align: center;
      padding: 15px;
      margin: 10px 0;
      background: #fff3f3;
      border: 1px dashed #ff6b81;
      border-radius: 15px;
      display: none;
    }
    .retry-btn {
      background: var(--btn-blue);
      color: white;
      border: none;
      padding: 8px 18px;
      border-radius: 12px;
      font-weight: bold;
      cursor: pointer;
      margin-top: 8px;
    }

    /* --- Floating User Chat Button --- */
    .user-chat-float-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 65px;
      height: 65px;
      border-radius: 50%;
      background: linear-gradient(135deg, #ffd1df 0%, #ffb6c1 100%);
      color: #5c3a6b;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: bold;
      box-shadow: 0 6px 16px rgba(255, 182, 193, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.6);
      cursor: pointer;
      z-index: 9999;
      border: 2px solid #ffffff;
      transition: transform 0.25s ease, box-shadow 0.25s ease;
      text-align: center;
      line-height: 1.1;
      padding: 4px;
      box-sizing: border-box;
    }
    .user-chat-float-btn:hover {
      transform: scale(1.08);
      box-shadow: 0 8px 20px rgba(255, 182, 193, 0.8);
    }
    .user-chat-float-btn:active {
      transform: scale(0.95);
    }
    .user-chat-float-btn .chat-icon {
      font-size: 20px;
      margin-bottom: 2px;
    }

    /* --- Chat Modal Layout --- */
    .chat-modal-overlay {
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background-color: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(6px);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 99999;
    }
    .chat-modal-overlay.active {
      display: flex !important;
    }

    .chat-container-card {
      background: #ffffff;
      width: 95vw;
      max-width: 1000px;
      height: 85vh;
      border-radius: 24px;
      box-shadow: 0 12px 30px rgba(0,0,0,0.25);
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
    }

    .chat-header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 20px;
      background: linear-gradient(135deg, var(--text-main) 0%, #3a2245 100%);
      color: #ffffff;
      font-weight: bold;
      font-size: 16px;
      flex-shrink: 0;
    }

    .close-chat-modal {
      font-size: 24px;
      cursor: pointer;
      color: #ffffff;
      font-weight: bold;
      line-height: 1;
      transition: opacity 0.2s;
    }
    .close-chat-modal:hover {
      opacity: 0.8;
    }

    /* --- Split Dual-Pane View --- */
    .chat-dual-split-body {
      display: flex;
      flex-direction: row;
      flex: 1;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #f4f6f9;
      position: relative;
    }

    .chat-zone-list {
      flex: 1;
      width: 50%;
      background: #ffffff;
      border-right: 2px solid #e0e6ed;
      display: flex;
      flex-direction: column;
      transition: flex 0.35s cubic-bezier(0.25, 1, 0.5, 1), width 0.35s cubic-bezier(0.25, 1, 0.5, 1);
      overflow: hidden;
      box-sizing: border-box;
      user-select: none;
    }

    .chat-zone-room {
      flex: 1;
      width: 50%;
      background: #fafbfc;
      display: flex;
      flex-direction: column;
      transition: flex 0.35s cubic-bezier(0.25, 1, 0.5, 1), width 0.35s cubic-bezier(0.25, 1, 0.5, 1);
      overflow: hidden;
      box-sizing: border-box;
      user-select: none;
    }

    .chat-zone-list.expanded { flex: 3 !important; }
    .chat-zone-room.shrunk { flex: 1 !important; }
    .chat-zone-room.expanded { flex: 3 !important; }
    .chat-zone-list.shrunk { flex: 1 !important; }

    .chat-list-header {
      padding: 12px 15px;
      background: #f8f9fa;
      border-bottom: 1px solid #eee;
      font-weight: bold;
      color: var(--text-main);
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .chat-list-items {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
    }

    .chat-item-card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px;
      border-radius: 12px;
      background: #ffffff;
      border: 1px solid #eef2f6;
      margin-bottom: 8px;
      cursor: pointer;
      transition: background 0.2s, transform 0.15s;
    }
    .chat-item-card:hover, .chat-item-card.active {
      background: #eef5ff;
      border-color: var(--btn-blue);
    }

    .chat-item-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #d0e0f0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      flex-shrink: 0;
    }

    .chat-item-info {
      flex: 1;
      min-width: 0;
    }
    .chat-item-title {
      font-size: 13px;
      font-weight: bold;
      color: #333;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .chat-item-preview {
      font-size: 11px;
      color: #777;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Inner Styling for Chat Room */
    .chat-room-header {
      padding: 12px 15px;
      background: #ffffff;
      border-bottom: 1px solid #eef2f6;
      font-weight: bold;
      color: var(--text-main);
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .chat-messages-box {
      flex: 1;
      overflow-y: auto;
      padding: 15px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: #f8fafc;
    }
    .chat-bubble {
      max-width: 75%;
      padding: 10px 14px;
      border-radius: 16px;
      font-size: 13px;
      line-height: 1.4;
      word-wrap: break-word;
    }
    .chat-bubble.sent {
      align-self: flex-end;
      background: linear-gradient(135deg, #4a83cc 0%, #2b5893 100%);
      color: #ffffff;
      border-bottom-right-radius: 4px;
    }
    .chat-bubble.received {
      align-self: flex-start;
      background: #ffffff;
      color: #333333;
      border: 1px solid #e2e8f0;
      border-bottom-left-radius: 4px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.02);
    }
    .chat-input-bar {
      padding: 10px 15px;
      background: #ffffff;
      border-top: 1px solid #eef2f6;
      display: flex;
      gap: 8px;
      align-items: center;
      flex-shrink: 0;
    }
    .chat-input-field {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid #cbd5e1;
      border-radius: 20px;
      font-size: 13px;
      outline: none;
    }
    .chat-input-field:focus {
      border-color: var(--btn-blue);
    }
    .chat-send-btn {
      background: var(--btn-blue);
      color: white;
      border: none;
      padding: 10px 16px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: bold;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <!-- ปุ่ม คุยกับ AI (Global Floating Top-Right) -->
  <button id="toggleBtn" class="voice-btn" onclick="toggleVoiceSession()">🎙️คุยกับAI</button>

  <!-- ปุ่ม ลอยเปิดแชทผู้ใช้ (Floating Chat Button) -->
  <div class="user-chat-float-btn" onclick="openUserChatModal()">
    <span class="chat-icon">💬</span>
    <span>แชท</span>
  </div>

  <!-- ส่วนบน: AI Voice & Tabs Container -->
  <div id="ai-section">
    <div class="ai-controls-row">
      <button id="locationFilterBtn" onclick="openLocationModal()">📍 พิกัด ▾</button>
      <div class="header-center-logos">
        <div id="avatarCircle" class="ai-avatar">🤖</div>
      </div>
    </div>

    <!-- แถบระบบนำทาง 4 แท็บ -->
    <div class="tabs-nav">
      <button id="tab-btn-realestate" class="tab-btn active" onclick="switchTab('realestate')">🏠 อสังหาฯ</button>
      <button id="tab-btn-decor" class="tab-btn" onclick="switchTab('decor')">🎨 แต่งบ้าน</button>
      <button id="tab-btn-lifestyle" class="tab-btn" onclick="switchTab('lifestyle')">☕ ไลฟ์สไตล์</button>
      <button id="tab-btn-others" class="tab-btn" onclick="switchTab('others')">🔧 ช่าง/บริการ</button>
    </div>

    <!-- แท็บ 1: อสังหาริมทรัพย์ -->
    <div id="tab-content-realestate" class="tab-content" style="display: block;">
      <div class="input-status-row">
        <input type="text" id="customEditBox" class="custom-edit" placeholder="พิมพ์หรือพูดสเปกบ้านที่ต้องการ..." onchange="testShowList()" />
        <div id="statusText">🟢 พร้อมฟัง... บอกสเปกบ้านมาได้เลยครับ</div>
      </div>

      <div class="filter-scroll-row">
        <button class="filter-btn" onclick="openDropdownModal('ขาย/เช่า')">ขาย/เช่า ▾</button>
        <button class="filter-btn" onclick="openDropdownModal('คอนโด/บ้าน')">คอนโด/บ้าน ▾</button>
        <button class="filter-btn" onclick="openDropdownModal('ราคาขาย')">ราคาขาย ▾</button>
        <button class="filter-btn" onclick="openDropdownModal('ราคาเช่า')">ราคาเช่า ▾</button>
        <button class="filter-btn" onclick="openDropdownModal('จังหวัด')">จังหวัด ▾</button>
        <button class="filter-btn" onclick="openDropdownModal('เขต/อำเภอ')">เขต/อำเภอ ▾</button>
        <button class="filter-btn" onclick="openDropdownModal('ถนน')">ถนน ▾</button>
        <button class="filter-btn" onclick="openDropdownModal('เนื้อที่')">เนื้อที่ ▾</button>
        <button class="filter-btn" onclick="resetAllFilters()">🔄 รีเซ็ตค่าทั้งหมด</button>
      </div>

      <div style="display: flex; justify-content: flex-end; width: 100%; margin-top: 4px;">
        <button class="action-show-list-btn" onclick="testShowList()">🔍 ค้นหาบ้าน</button>
      </div>
    </div>

    <!-- แท็บ 2: แต่งบ้าน -->
    <div id="tab-content-decor" class="tab-content" style="display: none;">
      <div class="input-status-row">
        <input type="text" id="customEditBoxDecor" class="custom-edit" placeholder="ค้นหาของแต่งบ้าน อุปกรณ์ซ่อมบ้าน..." />
      </div>
      <div class="empty-tab-box">🎨 หมวดแต่งบ้านและอุปกรณ์ตกแต่ง</div>
    </div>

    <!-- แท็บ 3: ไลฟ์สไตล์ -->
    <div id="tab-content-lifestyle" class="tab-content" style="display: none;">
      <div class="input-status-row">
        <input type="text" id="customEditBoxLifestyle" class="custom-edit" placeholder="ค้นหาร้านอาหาร คาเฟ่ แหล่งท่องเที่ยว..." />
      </div>
      <div class="empty-tab-box">☕ หมวดไลฟ์สไตล์ ร้านอาหาร และสถานที่เที่ยว</div>
    </div>

    <!-- แท็บ 4: ช่าง/บริการ -->
    <div id="tab-content-others" class="tab-content" style="display: none;">
      <div class="input-status-row">
        <input type="text" id="customEditBoxOthers" class="custom-edit" placeholder="ค้นหาช่างซ่อมบ้าน ช่างไฟ ช่างแอร์..." />
      </div>
      <div class="empty-tab-box">🔧 หมวดช่างซ่อมบำรุง และงานบริการต่างๆ</div>
    </div>
  </div>

  <!-- ส่วนล่าง: List View แสดงรายการบ้าน -->
  <div id="list-section">
    <div id="resultsContainer"></div>
    <div id="infiniteLoader" class="infinite-loader">⏳ กำลังโหลดข้อมูลเพิ่มเติม...</div>
    <div id="fallbackRetryCard" class="fallback-retry-card">
      <div>⚠️ ไม่สามารถเชื่อมต่อระบบได้ชั่วคราว</div>
      <button class="retry-btn" onclick="retryNextPage()">ลองใหม่อีกครั้ง</button>
    </div>
  </div>

  <!-- Modal ปักหมุดแผนที่ -->
  <div id="locationModalOverlay" class="modal-overlay">
    <div class="detail-modal" style="height: 90vh;">
      <span class="close-modal" onclick="closeLocationModal()">&times;</span>
      <h3 style="margin-top: 0; color: var(--text-main);">📍 เลือกตำแหน่งพิกัดและระยะทาง</h3>
      
      <div style="position: relative; margin-bottom: 10px;">
        <input type="text" id="placeSearchInput" class="custom-edit" style="width: 100%;" placeholder="🔍 ค้นหาชื่อสถานที่, หมู่บ้าน, ถนน..." oninput="handlePlaceSearchInput(this.value)" />
        <div id="placeSearchResults" style="position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #ccc; border-radius: 10px; max-height: 200px; overflow-y: auto; z-index: 9999; display: none; box-shadow: 0 4px 10px rgba(0,0,0,0.15);"></div>
      </div>

      <div id="locationMap" style="width: 100%; height: 280px; border-radius: 15px; margin-bottom: 10px;"></div>

      <div style="display: flex; gap: 8px; margin-bottom: 10px;">
        <input type="number" step="any" id="latInput" class="custom-edit" placeholder="Latitude" onchange="updateMapFromInputs()" />
        <input type="number" step="any" id="lngInput" class="custom-edit" placeholder="Longitude" onchange="updateMapFromInputs()" />
      </div>

      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
        <label style="font-weight: bold; font-size: 13px;">รัศมีรอบพิกัด:</label>
        <select id="radiusSelect" class="custom-edit" style="width: auto;" onchange="updateRadiusCircle()">
          <option value="1">1 กม.</option>
          <option value="3">3 กม.</option>
          <option value="5">5 กม.</option>
          <option value="10">10 กม.</option>
          <option value="20">20 กม.</option>
        </select>
        <button onclick="getCurrentUserLocation()" class="filter-btn" style="padding: 8px 12px;">🎯 ตำแหน่งฉัน</button>
      </div>

      <div style="display: flex; gap: 8px; margin-top: auto;">
        <button class="action-show-list-btn" style="flex: 1; background: #28a745; color: #fff; border: none;" onclick="confirmLocation()">✅ ยืนยันพิกัด</button>
        <button class="action-show-list-btn" style="flex: 1; background: #4a83cc; color: #fff; border: none;" onclick="openGoogleMaps()">🗺️ เปิด Google Maps</button>
        <button class="action-show-list-btn" style="background: #dc3545; color: #fff; border: none;" onclick="clearLocationFilter()">🗑️ ล้างพิกัด</button>
      </div>
    </div>
  </div>

  <!-- Modal ตัวเลือก Dropdown -->
  <div id="dropdownModalOverlay" class="modal-overlay">
    <div class="dropdown-modal">
      <span class="close-modal" onclick="closeDropdownModal()">&times;</span>
      <h3 id="dropdownModalTitle" style="margin-top: 0; color: var(--text-main);">เลือกรายการ</h3>
      <input type="text" id="dropdownSearchInput" class="dropdown-search-input" placeholder="🔍 ค้นหาตัวเลือก..." oninput="filterDropdownOptions()" />
      <div id="dropdownOptions" class="dropdown-options-container"></div>
    </div>
  </div>

  <!-- Modal รายละเอียดบ้าน -->
  <div id="detailModalOverlay" class="modal-overlay">
    <div class="detail-modal">
      <span class="close-modal" onclick="closeDetailModal()">&times;</span>
      <div id="modalSlider" class="image-slider"></div>
      <div class="detail-content">
        <div id="modalTitle" class="detail-title"></div>
        <div id="modalPrice" class="detail-price"></div>
        <a id="modalDeepLink" target="_blank" style="display: inline-block; margin: 8px 0; color: var(--btn-blue); font-weight: bold;">🔗 เปิดดูโพสต์ต้นฉบับ</a>
        <div id="modalDesc" style="font-size: 14px; line-height: 1.5; color: #444; margin-top: 10px;"></div>
      </div>
    </div>
  </div>

  <!-- Modal แชทกับเจ้าของบ้าน (Chat Dual Split Screen) -->
  <div id="userChatModalOverlay" class="chat-modal-overlay">
    <div class="chat-container-card">
      <div class="chat-header-bar">
        <span>💬 สนทนา / ติดต่อเจ้าของบ้าน</span>
        <span class="close-chat-modal" onclick="closeUserChatModal()">&times;</span>
      </div>
      <div class="chat-dual-split-body">
        <!-- ฝั่งซ้าย: รายการแชท -->
        <div id="chatZoneList" class="chat-zone-list" onclick="expandChatZone('list')">
          <div class="chat-list-header">
            <span>📥 รายการติดต่อ</span>
          </div>
          <div class="chat-list-items">
            <div class="chat-item-card active" onclick="selectChatRoom('ห้องแชทเจ้าของบ้าน', 'เจ้าของประกาศ')">
              <div class="chat-item-avatar">🏠</div>
              <div class="chat-item-info">
                <div class="chat-item-title">เจ้าของประกาศบ้าน</div>
                <div class="chat-item-preview">สอบถามรายละเอียดเพิ่มเติม...</div>
              </div>
            </div>
          </div>
        </div>

        <!-- ฝั่งขวา: ห้องแชทสนทนา -->
        <div id="chatZoneRoom" class="chat-zone-room" onclick="expandChatZone('room')">
          <div class="chat-room-header">
            <span id="chatActiveTitle">💬 คุยกับเจ้าของบ้าน</span>
          </div>
          <div id="chatMessagesContainer" class="chat-messages-box"></div>
          <div class="chat-input-bar">
            <input type="text" id="chatMessageInput" class="chat-input-field" placeholder="พิมพ์ข้อความคุยกับเจ้าของ..." onkeypress="if(event.key==='Enter') sendChatMessage()" />
            <button class="chat-send-btn" onclick="sendChatMessage()">ส่ง</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
// ==========================================
    // 1. CONFIGURATION & CONSTANTS
    // ==========================================
    const CONFIG = {
      BACKEND_WS_URL: "wss://land-matching-backend.onrender.com",
      RENDER_API_URL: "https://land-matching-backend.onrender.com/api/properties",
      GAS_WEB_APP_URL: "https://script.google.com/macros/s/AKfycbx5ll_Srh_K49qO4BUCTP-zsqaYtZg8Ey3vAVctmYpEb-pvZTDsqU65Ki8muKrZgBYL8A/exec",
      LIFF_ID: "2011006139-Wn6PhY6D"
    };

    const SHEET_COLUMNS = [
      'ชื่อ Facebook ผู้โพสต์', 'โครงการ', 'ประเภทอสังหา', 'จังหวัด', 'เขต/อำเภอ',
      'ถนน', 'แบบราคา', 'ราคาขาย', 'ราคาเช่า', 'เนื้อที่', 'เนื้อที่ ตัวเลข',
      'เบอร์', 'line id', 'date', 'use', 'use2', 'use3', 'use4', 'url',
      'post ID', 'บันทึกรายละเอียดในโพสต์ (ไม่เกิน 400 คำ)', 'ลักษณะกิจการ', 'use5'
    ];

    // ตัวแปรสำหรับระบบพิกัดและแผนที่
    let leafletMap = null;
    let mapMarker = null;
    let radiusCircle = null;
    let selectedLat = null;
    let selectedLng = null;
    let selectedRadius = 1;
    let placeSearchDebounceTimer = null;

    // ==========================================
    // 2. CENTRALIZED APPLICATION STATE
    // ==========================================
    const AppState = {
      voice: {
        isActive: false,
        isSetupReady: false,
        ws: null,
        audioCtx: null,
        mediaStream: null,
        processor: null,
        audioOutCtx: null,
        nextPlayTime: 0,
        hasGreeted: false,
        silenced: false
      },
      data: {
        isFetching: false,
        properties: []
      },
      pagination: {
        offset: 0,
        limit: 10,
        hasMore: true,
        isLoading: false,
        reqId: 0,
        renderedKeys: new Set(),
        lastCriteria: {},
        lastSearchText: ""
      },
      ui: {
        dropdownTopic: "",
        dropdownOptions: []
      }
    };

    // ==========================================
    // Supabase Chat Setup & Backend Integration
    // ==========================================
    const SUPABASE_URL = 'https://eywnasnyumqmlezjginj.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_851g6ybUEz9OWjZjenqRMQ_5jC-7OLy';
    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const CURRENT_ROOM_ID = 101;
    const CURRENT_USER_ID = 1;
    let currentActiveRoomId = CURRENT_ROOM_ID;
    let currentRealtimeChannel = null;

    // ==========================================
    // LINE LIFF SDK Initialization & Supabase Sync
    // ==========================================
    let currentUserLineProfile = null;

    async function initLIFF() {
      try {
        if (typeof liff !== 'undefined' && CONFIG.LIFF_ID) {
          await liff.init({ liffId: CONFIG.LIFF_ID });
          if (liff.isLoggedIn()) {
            const profile = await liff.getProfile();
            currentUserLineProfile = profile;
            if (profile && profile.userId) {
              await saveUserLineIdToSupabase(profile.userId);
            }
          }
        }
      } catch (err) {
        console.error("LIFF Init Error:", err);
      }
    }

    async function saveUserLineIdToSupabase(lineId) {
      if (!lineId) return;
      try {
        const { data, error } = await supabaseClient
          .from('users')
          .upsert({ line_id: lineId }, { onConflict: 'line_id' });
        if (error) {
          console.error("Error saving line_id to Supabase users table:", error);
        } else {
          console.log("Successfully synced line_id to Supabase users table:", lineId);
        }
      } catch (e) {
        console.error("Exception in saveUserLineIdToSupabase:", e);
      }
    }

    function displayMessageOnUI(msg) {
      const container = document.getElementById('chatMessagesContainer');
      if (!container) return;
      const bubble = document.createElement('div');
      const isMe = msg.sender_id === CURRENT_USER_ID;
      bubble.className = `chat-bubble ${isMe ? 'sent' : 'received'}`;
      bubble.innerText = msg.content;
      container.appendChild(bubble);
      container.scrollTop = container.scrollHeight;
    }

    // ระบบโหลดประวัติแชทและสร้าง Realtime ให้กับห้องแชท [คำสั่งที่ 3]
    async function loadChatHistoryForRoom(roomId) {
      const container = document.getElementById('chatMessagesContainer');
      if (container) container.innerHTML = ''; 
      
      try {
        const { data: messages, error } = await supabaseClient
          .from('chat_messages')
          .select('*')
          .eq('room_id', roomId)
          .order('created_at', { ascending: true });

        if (error) {
          console.error("Supabase load chat error:", error);
        }

        if (messages && messages.length > 0) {
          messages.forEach(msg => displayMessageOnUI(msg));
        } else if (container) {
          container.innerHTML = `<div style="text-align:center; color:#888; font-size:12px; margin-top:20px;">เริ่มต้นการสนทนากับเจ้าของบ้านที่นี่</div>`;
        }
      } catch (e) {
        console.error("Error loading chat history:", e);
      }
    }

    function initRealtimeForRoom(roomId) {
      if (currentRealtimeChannel) {
        supabaseClient.removeChannel(currentRealtimeChannel);
      }

      currentRealtimeChannel = supabaseClient
        .channel(`room_${roomId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
          (payload) => {
            const container = document.getElementById('chatMessagesContainer');
            if (container && container.innerText.includes('เริ่มต้นการสนทนา')) {
              container.innerHTML = '';
            }
            displayMessageOnUI(payload.new);
          }
        )
        .subscribe();
    }

    // ฟังก์ชันเข้าสู่ห้องแชทกับเจ้าของบ้าน เมื่อกดปุ่ม "คุยกับเจ้าของ" [คำสั่งที่ 3]
    async function openOwnerChat(propertyId, projectTitle, ownerName) {
      let roomId = parseInt(propertyId);
      if (isNaN(roomId) || roomId <= 0) {
        roomId = CURRENT_ROOM_ID;
      }
      currentActiveRoomId = roomId;

      const titleElem = document.getElementById('chatActiveTitle');
      if (titleElem) {
        titleElem.innerText = `💬 คุยกับเจ้าของ: ${ownerName || 'เจ้าของประกาศ'} (${projectTitle || 'รายการนี้'})`;
      }

      openUserChatModal();
      expandChatZone('room');

      await loadChatHistoryForRoom(roomId);
      initRealtimeForRoom(roomId);
    }

    async function sendChatMessage() {
      const input = document.getElementById('chatMessageInput');
      const container = document.getElementById('chatMessagesContainer');
      if (!input || !container) return;
      const text = input.value.trim();
      if (!text) return;
      
      input.value = '';

      if (container.innerText.includes('เริ่มต้นการสนทนา')) {
        container.innerHTML = '';
      }
      
      try {
        const { error } = await supabaseClient.from('chat_messages').insert([
          { room_id: currentActiveRoomId || CURRENT_ROOM_ID, sender_id: CURRENT_USER_ID, content: text }
        ]);
        if (error) console.error("Error sending chat message:", error);
      } catch (e) {
        console.error("Exception in sendChatMessage:", e);
      }
    }

    function getPropValue(item, possibleKeys, defaultVal = '') {
      if (!item) return defaultVal;
      const keys = Array.isArray(possibleKeys) ? possibleKeys : [possibleKeys];
      for (const k of keys) {
        if (item[k] !== undefined && item[k] !== null && String(item[k]).trim() !== '') {
          return item[k];
        }
      }
      return defaultVal;
    }

    // ==========================================
    // 3. UI, TABS & INFINITE SCROLL BINDINGS
    // ==========================================
    function switchTab(tabId) {
      stopAIVoiceSpeech();
      
      const aiSection = document.getElementById('ai-section');
      if (aiSection && aiSection.classList.contains('collapsed')) {
        aiSection.classList.remove('collapsed');
      }

      const tabs = ['realestate', 'decor', 'lifestyle', 'others'];
      tabs.forEach(id => {
        const btn = document.getElementById('tab-btn-' + id);
        const content = document.getElementById('tab-content-' + id);
        if (btn) btn.classList.remove('active');
        if (content) content.style.display = 'none';
      });

      const activeBtn = document.getElementById('tab-btn-' + tabId);
      const activeContent = document.getElementById('tab-content-' + tabId);
      if (activeBtn) activeBtn.classList.add('active');
      if (activeContent) activeContent.style.display = 'block';
    }

    async function checkAndDisplayMemberStatus() {
      const urlParams = new URLSearchParams(window.location.search);
      let lineId = urlParams.get('lineId') || localStorage.getItem('line_user_id');

      if (!lineId && typeof liff !== 'undefined') {
        try {
          if (!liff.isLoggedIn()) {
            liff.login();
            return;
          }
          const profile = await liff.getProfile();
          if (profile && profile.userId) {
            lineId = profile.userId;
            currentUserLineProfile = profile;
            localStorage.setItem('line_user_id', lineId);
            await saveUserLineIdToSupabase(profile.userId);
          }
        } catch (e) {
          console.error("LIFF Profile Error:", e);
        }
      }

      console.log("LINE ID ของผู้ใช้คือ:", lineId);

      let isMember = false;
      if (lineId) {
        try {
          const { data } = await supabaseClient
            .from('users')
            .select('*')
            .eq('line_id', lineId)
            .maybeSingle();

          if (data) isMember = true;
        } catch (err) {
          console.error("Error checking membership:", err);
        }
      }

      const container = document.getElementById('resultsContainer');
      if (container) {
        const memberLabel = isMember ? " (สมาชิก)" : " (ยังไม่เป็นสมาชิก)";
        const displayLineId = lineId ? lineId : "ไม่พบ LINE ID (เปิดนอก LIFF / เบราว์เซอร์ปกติ)";
        
        let targetHeading = container.querySelector('h3');
        if (targetHeading) {
          targetHeading.innerText = `LINE ID: ${displayLineId}${memberLabel} - ยินดีต้อนรับสู่ Land Matching`;
        } else {
          const banner = document.createElement('div');
          banner.style.cssText = 'background: #f0f4f8; padding: 15px; border-radius: 12px; margin-bottom: 15px; text-align: center; border: 1px solid #d0e0f0;';
          banner.innerHTML = `<h3 style="margin:0; font-size: 16px; color: var(--text-main);">LINE ID: ${displayLineId}${memberLabel} - ยินดีต้อนรับสู่ Land Matching</h3>`;
          container.insertBefore(banner, container.firstChild);
        }
      }
    }
  
    window.addEventListener('load', () => {
      initLIFF().then(() => {
        checkAndDisplayMemberStatus();
      });

      setTimeout(() => {
        if (!AppState.voice.isActive && !AppState.voice.ws) {
          startVoiceSession();
        }
      }, 1000);
      
      loadChatHistoryForRoom(CURRENT_ROOM_ID);
      initRealtimeForRoom(CURRENT_ROOM_ID);

      const listSection = document.getElementById('list-section');
      const aiSection = document.getElementById('ai-section');
      let lastScrollTop = 0;

      if (listSection) {
        listSection.addEventListener('scroll', () => {
          let currentScroll = listSection.scrollTop;
          if (currentScroll > lastScrollTop && currentScroll > 20) {
            if (aiSection) aiSection.classList.add('collapsed');
          } else if (currentScroll < lastScrollTop) {
            if (aiSection) aiSection.classList.remove('collapsed');
          }
          lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;

          if (AppState.pagination.isLoading || !AppState.pagination.hasMore) return;
          
          const remainingScroll = listSection.scrollHeight - (currentScroll + listSection.clientHeight);
          if (remainingScroll < 600) {
            loadNextPage();
          }
        });
      }

      document.addEventListener('click', (e) => {
        const resultsDiv = document.getElementById('placeSearchResults');
        const searchInput = document.getElementById('placeSearchInput');
        if (resultsDiv && searchInput && !resultsDiv.contains(e.target) && e.target !== searchInput) {
          resultsDiv.style.display = 'none';
        }
      });
    });

    function triggerSearchReset() {
      testShowList();
    }

    function resetAllFilters() {
      const editBox = document.getElementById('customEditBox');
      if (editBox) editBox.value = '';
      
      const filterBtns = document.querySelectorAll('.filter-btn');
      filterBtns.forEach(btn => {
        const onClickAttr = btn.getAttribute('onclick') || '';
        if (onClickAttr.includes('openDropdownModal')) {
          const topicMatch = onClickAttr.match(/openDropdownModal\('([^']+)'\)/);
          if (topicMatch && topicMatch[1]) {
            btn.innerText = `${topicMatch[1]} ▾`;
          }
        }
      });
      clearLocationFilter();
    }

    function getDropdownOptionsForTopic(topic) {
      if (topic === 'ขาย/เช่า') {
        return ["ขาย", "เช่า", "ขาย-เช่า", "เช่า-ซื้อ", "เซ้ง", "หาซื้อ", "หาเช่า"];
      } else if (topic === 'คอนโด/บ้าน') {
        return ["บ้าน", "คอนโด", "ทาวน์เฮาส์", "ทาวน์โฮม", "ตึกแถว", "อาคารพาณิชย์", "ร้านค้า", "ตลาด"];
      } else if (topic === 'ราคาขาย') {
        return ["ไม่เกิน 2 ล้าน", "ไม่เกิน 5 ล้าน", "ไม่เกิน 10 ล้าน", "ไม่เกิน 20 ล้าน", "ตั้งแต่ 20 ล้านเป็นต้นไป"];
      } else if (topic === 'ราคาเช่า') {
        return ["ไม่เกิน 5,000", "ไม่เกิน 10,000", "ไม่เกิน 15,000", "ไม่เกิน 20,000", "ตั้งแต่ 20,000 เป็นต้นไป"];
      } else if (topic === 'จังหวัด') {
        return ["กทม.", "นนทบุรี", "ปทุมธานี", "สมุทรปราการ", "สมุทรสงคราม", "เชียงใหม่", "ภูเก็ต", "สงขลา"];
      } else if (topic === 'เขต/อำเภอ') {
        return ["บางกะปิ", "บึงกุ่ม", "คลองสามวา", "ลาดพร้าว", "มีนบุรี"];
      } else if (topic === 'ถนน') {
        return ["ถนนศรีนครินทร์", "ถนนลาดพร้าว", "ถนนรามอินทรา", "ถนนสุขุมวิท", "ถนนพหลโยธิน", "ถนนรัชดาภิเษก", "ถนนเพชรบุรี"];
      } else if (topic === 'เนื้อที่' || topic === 'ขนาด' || topic === 'ปรับขนาด') {
        return ["ไม่เกิน 100 ตารางวา", "ไม่เกิน 400 ตารางวา", "ไม่เกิน 10 ไร่", "มากกว่า 10 ไร่ เป็นต้นไป"];
      } else {
        return [`ตัวเลือก ${topic} ที่ 1`, `ตัวเลือก ${topic} ที่ 2`, `ตัวเลือก ${topic} ที่ 3`];
      }
    }

    function getAllValidDropdownOptions() {
      const topics = ['ขาย/เช่า', 'คอนโด/บ้าน', 'ราคาขาย', 'ราคาเช่า', 'จังหวัด', 'เขต/อำเภอ', 'ถนน', 'โครงการ', 'ซอย', 'เนื้อที่', 'อื่นๆ', 'สถานที่ใกล้เคียง', 'สาธารณูปโภคพิเศษ'];
      let allOptions = [];
      topics.forEach(t => {
        allOptions = allOptions.concat(getDropdownOptionsForTopic(t));
      });
      return [...new Set(allOptions)];
    }

    function openDropdownModal(topic) {
      stopAIVoiceSpeech();
      AppState.ui.dropdownTopic = topic;
      document.getElementById('dropdownModalTitle').innerText = `เลือก: ${topic}`;
      document.getElementById('dropdownSearchInput').value = '';
      
      let options = getDropdownOptionsForTopic(topic);
      AppState.ui.dropdownOptions = options;
      renderDropdownOptions(AppState.ui.dropdownOptions);
      document.getElementById('dropdownModalOverlay').classList.add('active');
    }

    function renderDropdownOptions(optionsToRender) {
      const optionsContainer = document.getElementById('dropdownOptions');
      optionsContainer.innerHTML = '';
      if (optionsToRender.length === 0) {
        optionsContainer.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">ไม่พบตัวเลือกที่ค้นหา</div>';
        return;
      }
      
      optionsToRender.forEach(opt => {
        optionsContainer.innerHTML += `<button class="dropdown-option-btn" onclick="selectDropdownOption('${AppState.ui.dropdownTopic}', '${opt}')">${opt}</button>`;
      });
    }

    function filterDropdownOptions() {
      const searchText = document.getElementById('dropdownSearchInput').value.toLowerCase();
      const filteredOptions = AppState.ui.dropdownOptions.filter(opt => 
        opt.toLowerCase().includes(searchText)
      );
      renderDropdownOptions(filteredOptions);
    }

    function closeDropdownModal() {
      stopAIVoiceSpeech();
      document.getElementById('dropdownModalOverlay').classList.remove('active');
    }

    function selectDropdownOption(topic, value) {
      closeDropdownModal();
      const filterBtns = document.querySelectorAll('.filter-btn');
      filterBtns.forEach(btn => {
        const onClickAttr = btn.getAttribute('onclick') || '';
        if (onClickAttr.includes(`'${topic}'`) || (topic === 'เนื้อที่' && (onClickAttr.includes("'ขนาด'") || onClickAttr.includes("'ปรับขนาด'")))) {
          btn.innerText = (value === "เคลียร์ค่า") ? `${topic} ▾` : `${value} ▾`;
        }
      });
      testShowList();
    }
// ==========================================
    // 4. ฟังก์ชันจัดการระบบพิกัด & Map Pop-up
    // ==========================================
    function updateRadiusCircle() {
      if (!leafletMap || !selectedLat || !selectedLng) return;
      const radiusInKm = parseFloat(document.getElementById('radiusSelect').value) || 1;
      const radiusInMeters = radiusInKm * 1000;
      const centerLatLng = new L.LatLng(selectedLat, selectedLng);
      if (radiusCircle) {
        radiusCircle.setLatLng(centerLatLng);
        radiusCircle.setRadius(radiusInMeters);
      } else {
        radiusCircle = L.circle(centerLatLng, {
          color: '#4a83cc',
          fillColor: '#4a83cc',
          fillOpacity: 0.15,
          radius: radiusInMeters
        }).addTo(leafletMap);
      }
      leafletMap.fitBounds(radiusCircle.getBounds());
    }

    function openLocationModal() {
      stopAIVoiceSpeech();
      document.getElementById('locationModalOverlay').classList.add('active');
      
      const defaultLat = selectedLat || 13.7563;
      const defaultLng = selectedLng || 100.5018;

      if (!leafletMap) {
        setTimeout(() => {
          leafletMap = L.map('locationMap').setView([defaultLat, defaultLng], 12);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(leafletMap);

          mapMarker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(leafletMap);

          mapMarker.on('dragend', function (e) {
            const pos = mapMarker.getLatLng();
            setCoordinates(pos.lat, pos.lng);
            updateRadiusCircle();
          });

          leafletMap.on('click', function (e) {
            mapMarker.setLatLng(e.latlng);
            setCoordinates(e.latlng.lat, e.latlng.lng);
            updateRadiusCircle();
          });

          if (!selectedLat && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
              const lat = pos.coords.latitude;
              const lng = pos.coords.longitude;
              leafletMap.setView([lat, lng], 14);
              mapMarker.setLatLng([lat, lng]);
              setCoordinates(lat, lng);
              updateRadiusCircle();
            }, () => {});
          } else if (selectedLat && selectedLng) {
            updateRadiusCircle();
          }
        }, 200);
      } else {
        setTimeout(() => {
          leafletMap.invalidateSize();
          if (selectedLat && selectedLng) {
            const latLng = [selectedLat, selectedLng];
            mapMarker.setLatLng(latLng);
            updateRadiusCircle();
          }
        }, 200);
      }

      if (selectedLat && selectedLng) {
        document.getElementById('latInput').value = selectedLat;
        document.getElementById('lngInput').value = selectedLng;
      }
      const radiusSelect = document.getElementById('radiusSelect');
      if (radiusSelect) {
        radiusSelect.value = String(selectedRadius || 1);
      }
      
      if (!AppState.voice.isActive || !AppState.voice.ws) {
        startVoiceSession().then(() => triggerLocationAIGreeting());
      } else {
        triggerLocationAIGreeting();
      }
    }
    
    function triggerLocationAIGreeting() {
      const prompt = `เมื่อผู้ใช้เปิดหน้าปักหมุดพิกัดแล้ว ให้พูดสั้นๆทันทีว่า: "ปักหมุดที่ไหนบอกได้เลย" และรอรับคำสั่งจากผู้ใช้โดยไม่ต้องอธิบายเพิ่มเติม`;
      const checkReady = setInterval(() => {
        if (AppState.voice.isActive && AppState.voice.ws && AppState.voice.ws.readyState === WebSocket.OPEN && AppState.voice.isSetupReady) {
          clearInterval(checkReady);
          sendTextToAI(prompt);
        }
      }, 500);
      setTimeout(() => clearInterval(checkReady), 10000);
    }

    function triggerInitialAIGreeting() {
      const prompt = `เมื่อผู้ใช้เปิดหน้าปักหมุดพิกัดแล้ว ให้พูดสั้นๆทันทีว่า: "1.9AI landmatching ผู้ช่วยค้นหา บ้าน ซ่อมบ้าน หาช่าง ร้านอาหาร บอกได้เลย"`;
      sendTextToAI(prompt);
    }

    function sendTextToAI(text) {
      AppState.voice.silenced = false;
      if (AppState.voice.ws && AppState.voice.ws.readyState === WebSocket.OPEN) {
        AppState.voice.ws.send(JSON.stringify({
          clientContent: {
            turns: [{
              role: "user",
              parts: [{ text: text }]
            }],
            turnComplete: true
          }
        }));
      }
    }

    function handlePlaceSearchInput(query) {
      clearTimeout(placeSearchDebounceTimer);
      const resultsDiv = document.getElementById('placeSearchResults');
      
      if (!query || query.trim().length < 4) {
        resultsDiv.style.display = 'none';
        resultsDiv.innerHTML = '';
        return;
      }
      
      placeSearchDebounceTimer = setTimeout(() => {
        const rawTrimmed = query.trim();
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(rawTrimmed)}&countrycodes=th&limit=6&addressdetails=1`)
          .then(res => res.json())
          .then(data => {
            resultsDiv.innerHTML = '';
            if (data && data.length > 0) {
              data.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.style.cssText = 'padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #eee; font-size: 13px; color: #333;';
                itemDiv.innerText = item.display_name;
                itemDiv.onclick = () => selectPlaceResult(item.lat, item.lon, item.display_name);
                resultsDiv.appendChild(itemDiv);
              });
              resultsDiv.style.display = 'block';
            } else {
              resultsDiv.innerHTML = '<div style="padding: 10px; font-size: 13px; color: #888; text-align: center;">ไม่พบสถานที่ที่ค้นหา</div>';
              resultsDiv.style.display = 'block';
            }
          })
          .catch(err => console.error("Place search error:", err));
      }, 400);
    }

    function selectPlaceResult(lat, lon, displayName) {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lon);
      
      document.getElementById('placeSearchInput').value = displayName;
      document.getElementById('placeSearchResults').style.display = 'none';
      
      setCoordinates(latitude, longitude);
      
      if (leafletMap && mapMarker) {
        const newLatLng = new L.LatLng(latitude, longitude);
        mapMarker.setLatLng(newLatLng);
        updateRadiusCircle(); 
      }
    }

    function setCoordinates(lat, lng) {
      selectedLat = parseFloat(lat).toFixed(6);
      selectedLng = parseFloat(lng).toFixed(6);
      document.getElementById('latInput').value = selectedLat;
      document.getElementById('lngInput').value = selectedLng;
    }

    function updateMapFromInputs() {
      const lat = parseFloat(document.getElementById('latInput').value);
      const lng = parseFloat(document.getElementById('lngInput').value);
      if (!isNaN(lat) && !isNaN(lng)) {
        selectedLat = lat;
        selectedLng = lng;
        if (leafletMap && mapMarker) {
          const newLatLng = new L.LatLng(lat, lng);
          mapMarker.setLatLng(newLatLng);
          updateRadiusCircle();
        }
      }
    }

    function getCurrentUserLocation() {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setCoordinates(lat, lng);
          if (leafletMap && mapMarker) {
            leafletMap.setView([lat, lng], 14);
            const newLatLng = new L.LatLng(lat, lng);
            mapMarker.setLatLng(newLatLng);
            updateRadiusCircle();
          }
        }, () => alert("ไม่สามารถดึงตำแหน่งปัจจุบันได้"));
      }
    }

    function closeLocationModal() {
      stopAIVoiceSpeech();
      const resultsDiv = document.getElementById('placeSearchResults');
      if (resultsDiv) resultsDiv.style.display = 'none';
      document.getElementById('locationModalOverlay').classList.remove('active');
    }

    function clearLocationFilter() {
      selectedLat = null;
      selectedLng = null;
      selectedRadius = 1;
      
      if (radiusCircle && leafletMap) {
        leafletMap.removeLayer(radiusCircle);
        radiusCircle = null;
      }

      document.getElementById('latInput').value = '';
      document.getElementById('lngInput').value = '';
      document.getElementById('placeSearchInput').value = '';
      document.getElementById('locationFilterBtn').innerText = '📍 พิกัด ▾';
      closeLocationModal();
      testShowList();
    }

    function openGoogleMaps() {
      stopAIVoiceSpeech();
      const lat = document.getElementById('latInput').value.trim();
      const lng = document.getElementById('lngInput').value.trim();
      if (lat && lng) {
        window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
      } else {
        alert('กรุณาระบุพิกัดก่อนครับ');
      }
    }

    function confirmLocation() {
      const lat = document.getElementById('latInput').value.trim();
      const lng = document.getElementById('lngInput').value.trim();
      const radiusSelect = document.getElementById('radiusSelect');
      const radiusVal = radiusSelect ? parseFloat(radiusSelect.value) : 1;
      if (lat && lng) {
        selectedLat = parseFloat(lat);
        selectedLng = parseFloat(lng);
        selectedRadius = isNaN(radiusVal) ? 1 : radiusVal;
        document.getElementById('locationFilterBtn').innerText = `📍 ${selectedLat.toFixed(3)}, ${selectedLng.toFixed(3)} (${selectedRadius} กม.) ▾`;
      } else {
        selectedLat = null;
        selectedLng = null;
        selectedRadius = 1;
        document.getElementById('locationFilterBtn').innerText = '📍 พิกัด ▾';
      }
      closeLocationModal();
      testShowList();
    }

    // ==========================================
    // 5. AI VOICE SESSION HANDLERS
    // ==========================================
    async function stopAIVoiceSpeech() {
      AppState.voice.silenced = true;
      if (AppState.voice.audioOutCtx) {
        if (AppState.voice.audioOutCtx.state !== 'closed' && AppState.voice.audioOutCtx.state !== 'closing') {
          try {
            await AppState.voice.audioOutCtx.close();
          } catch (e) {}
        }
        AppState.voice.audioOutCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        AppState.voice.nextPlayTime = AppState.voice.audioOutCtx.currentTime;
      }
    }

    async function toggleVoiceSession() {
      if (!AppState.voice.isActive) await startVoiceSession();
      else await stopVoiceSession();
    }

    async function startVoiceSession() {
      const btn = document.getElementById('toggleBtn');
      const avatar = document.getElementById('avatarCircle');
      const statusText = document.getElementById('statusText');

      if (AppState.voice.ws || AppState.voice.isActive) {
        await stopVoiceSession();
      }

      try {
        AppState.voice.isActive = true;
        AppState.voice.isSetupReady = false;
        AppState.voice.silenced = false;
        AppState.data.isFetching = false;
        
        if (statusText) {
          statusText.innerText = "กำลังเชื่อมต่อกับ AI...";
          statusText.classList.add('loading-pulse'); 
        }

        AppState.voice.audioOutCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        AppState.voice.nextPlayTime = AppState.voice.audioOutCtx.currentTime;

        AppState.voice.ws = new WebSocket(CONFIG.BACKEND_WS_URL);

        AppState.voice.ws.onopen = () => {
          if (AppState.voice.ws.readyState === WebSocket.OPEN) {
            const validDropdowns = getAllValidDropdownOptions().join(', ');
            const setupData = {
              setup: {
                model: "models/gemini-3.1-flash-live-preview", 
                generationConfig: {
                  responseModalities: ["AUDIO"],
                  speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } }
                },
                systemInstruction: {
                  parts: [{
                    text: `คุณคือ AI ผู้ช่วยค้นหา  หน้าที่หลักคือ:
                    1. พูดคุยสอบถามความต้องการลูกค้าด้วยเสียง (ใช้สรรพนาม 'ผม' และลงท้าย 'ครับ')
                    2. เมื่ออยู่ในแท็บอสังหาริมทรัพย์ หรือ เพิ่งเข้าสู่แท็บอสังหาริมทรัพย์ อันดับแรก AIถามทันทีว่า "ต้องการหาพื้นที่ใด ต้องการให้เปิดหน้าพิกัดไหม" ถ้าuserบอกต้องการ ให้AIเรียกใช้ฟังก์ชัน 'open_location_modal'
                    [รายการข้อความ Dropdown ที่อนุญาตให้ใช้]: ${validDropdowns}`
                  }]
                },
                tools: [
                  {
                    functionDeclarations: [
                      {
                        name: "submit_user_summary",
                        description: "ส่งสรุปข้อมูลความต้องการของลูกค้าเมื่อได้ข้อมูลครบถ้วนแล้ว",
                        parameters: {
                          type: "OBJECT",
                          properties: {
                            userData: { type: "OBJECT" },
                            criteria: { type: "OBJECT" }
                          }
                        }
                      },
                      {
                        name: "set_location_coordinates",
                        description: "ตั้งค่าพิกัดแผนที่",
                        parameters: {
                          type: "OBJECT",
                          properties: {
                            latitude: { type: "NUMBER" },
                            longitude: { type: "NUMBER" },
                            placeName: { type: "STRING" }
                          }
                        }
                      },
                      {
                        name: "switch_tab_category",
                        description: "เลือกแท็บตามหัวข้อ",
                        parameters: {
                          type: "OBJECT",
                          properties: { tabId: { type: "STRING" }, searchText: { type: "STRING" } }
                        }
                      },
                      {
                        name: "open_location_modal",
                        description: "เปิดหน้าพิกัด",
                        parameters: { type: "OBJECT", properties: {} }
                      }
                    ]
                  }
                ]
              }
            };
            AppState.voice.ws.send(JSON.stringify(setupData));
          }

          btn.innerHTML = "⏹️หยุดคุยกับAI";
          btn.classList.add('active');
          if (avatar) avatar.classList.add('pulse-animation');
        };

        AppState.voice.ws.onmessage = async (event) => {
          try {
            const response = JSON.parse(event.data);
            if (response.setupComplete) {
              AppState.voice.isSetupReady = true;
              if (statusText) {
                statusText.classList.remove('loading-pulse');
                statusText.innerText = "🟢 พร้อมฟัง... บอกสเปกบ้านมาได้เลยครับ";
              }
              await initMicrophone(); 
              if (!AppState.voice.hasGreeted) {
                triggerInitialAIGreeting();
                AppState.voice.hasGreeted = true;
              }
              return;
            }

            const parts = response.serverContent?.modelTurn?.parts || response.realtimeOutput?.pubsubParts;
            if (parts) {
              for (let part of parts) {
                if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith("audio/")) {
                  playPCMData(part.inlineData.data);
                }
              }
            }
          } catch (e) {}
        };
        AppState.voice.ws.onclose = () => stopVoiceSession();

      } catch (err) {
        if (statusText) {
          statusText.classList.remove('loading-pulse');
          statusText.innerText = "❌ เข้าถึงไมโครโฟนไม่ได้ โปรดอนุญาตสิทธิ์ในเบราว์เซอร์";
        }
      }
    }
async function initMicrophone() {
      AppState.voice.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      AppState.voice.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      
      const source = AppState.voice.audioCtx.createMediaStreamSource(AppState.voice.mediaStream);
      AppState.voice.processor = AppState.voice.audioCtx.createScriptProcessor(4096, 1, 1);

      source.connect(AppState.voice.processor);
      AppState.voice.processor.connect(AppState.voice.audioCtx.destination);
      AppState.voice.processor.onaudioprocess = (e) => {
        if (!AppState.voice.isActive || !AppState.voice.isSetupReady || !AppState.voice.ws || AppState.voice.ws.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = convertFloat32ToPCM16(inputData);
        const base64Audio = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));

        AppState.voice.ws.send(JSON.stringify({
          realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: base64Audio } }
        }));
      };
    }

    function convertFloat32ToPCM16(buffer) {
      let l = buffer.length;
      let buf = new Int16Array(l);
      while (l--) buf[l] = Math.max(-1, Math.min(1, buffer[l])) * 0x7FFF;
      return buf;
    }

    function playPCMData(base64Audio) {
      if (AppState.voice.silenced || !AppState.voice.audioOutCtx || AppState.voice.audioOutCtx.state === 'closed') return;
      const raw = atob(base64Audio);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;

      const buffer = AppState.voice.audioOutCtx.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);

      const source = AppState.voice.audioOutCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(AppState.voice.audioOutCtx.destination);

      if (AppState.voice.nextPlayTime < AppState.voice.audioOutCtx.currentTime) {
        AppState.voice.nextPlayTime = AppState.voice.audioOutCtx.currentTime;
      }
      source.start(AppState.voice.nextPlayTime);
      AppState.voice.nextPlayTime += buffer.duration;
    }

    async function stopVoiceSession() {
      AppState.voice.isActive = false;
      AppState.voice.isSetupReady = false;
      
      if (AppState.voice.ws) {
        AppState.voice.ws.onclose = null;
        AppState.voice.ws.close();
        AppState.voice.ws = null;
      }
      if (AppState.voice.mediaStream) {
        AppState.voice.mediaStream.getTracks().forEach(t => t.stop());
        AppState.voice.mediaStream = null;
      }

      const btn = document.getElementById('toggleBtn');
      const avatar = document.getElementById('avatarCircle');
      const statusText = document.getElementById('statusText');
      if (btn) {
        btn.innerHTML = "🎙️คุยกับAI";
        btn.classList.remove('active');
      }
      if (avatar) avatar.classList.remove('pulse-animation');
      if (statusText) statusText.innerText = "ปิดการใช้งานเสียงเรียบร้อย";
    }

    // ==========================================
    // 6. DATABASE & TARGETED INFINITE SCROLLING
    // ==========================================
    function getSelectedCriteria() {
      let criteria = {};
      const filterBtns = document.querySelectorAll('.filter-btn');
      
      filterBtns.forEach(btn => {
        const text = btn.innerText;
        if (!text.includes('▾') || text.includes('เคลียร์ค่า')) return;
        const val = text.replace(' ▾', '').replace('📍 ', '').trim();
        const onclick = btn.getAttribute('onclick') || '';
        
        if (onclick.includes('ขาย/เช่า')) criteria.priceType = val;
        else if (onclick.includes('คอนโด/บ้าน')) criteria.propertyType = val;
        else if (onclick.includes('ราคาขาย')) criteria.priceSale = val;
        else if (onclick.includes('ราคาเช่า')) criteria.priceRent = val;
        else if (onclick.includes('จังหวัด')) criteria.province = val;
        else if (onclick.includes('เขต/อำเภอ')) criteria.district = val;
        else if (onclick.includes('ถนน')) criteria.road = val;
        else if (onclick.includes('เนื้อที่')) criteria.areaMax = val;
      });

      if (selectedLat && selectedLng) {
        criteria.lat = selectedLat;
        criteria.lng = selectedLng;
        criteria.radius = selectedRadius || 1;
      }
      return criteria;
    }

    function testShowList() {
      AppState.pagination.offset = 0;
      AppState.pagination.hasMore = true;
      AppState.pagination.renderedKeys.clear();
      document.getElementById('resultsContainer').innerHTML = '';
      const activeInput = document.getElementById('customEditBox');
      const searchText = activeInput ? activeInput.value : '';
      fetchDatabase({}, getSelectedCriteria(), true, searchText);
    }

    async function fetchDatabase(userData = {}, criteria = {}, isNewSearch = false, searchText = "") {
      if (AppState.pagination.isLoading) return;
      AppState.pagination.isLoading = true;
      
      const loader = document.getElementById('infiniteLoader');
      const fallback = document.getElementById('fallbackRetryCard');
      if (loader) loader.style.display = 'block';
      if (fallback) fallback.style.display = 'none';

      if (isNewSearch) {
        AppState.pagination.offset = 0;
        AppState.pagination.hasMore = true;
        document.getElementById('resultsContainer').innerHTML = '';
      }

      try {
        const payload = {
          action: "searchAll",
          offset: AppState.pagination.offset,
          limit: AppState.pagination.limit,
          userData: userData,
          criteria: criteria,
          searchText: searchText
        };

        const response = await fetch(CONFIG.RENDER_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();

        if (data.status === 'success') {
          renderProperties(data.results);
          AppState.pagination.offset = data.nextOffset;
          AppState.pagination.hasMore = data.hasMore;
        } else {
          throw new Error(data.message || 'Error fetching data');
        }
      } catch (error) {
        console.error("Fetch Error:", error);
        if (fallback) fallback.style.display = 'block';
      } finally {
        AppState.pagination.isLoading = false;
        if (loader) loader.style.display = 'none';
      }
    }

    // ฟังก์ชันสกัดภาพบ้านจาก Supabase (สูงสุด 8 ภาพ) [คำสั่งที่ 1]
    function getPropertyImages(item) {
      let imgList = [];
      if (Array.isArray(item.images) && item.images.length > 0) {
        imgList = item.images;
      } else if (typeof item.images === 'string' && item.images.trim() !== '') {
        try {
          let parsed = JSON.parse(item.images);
          if (Array.isArray(parsed)) imgList = parsed;
        } catch(e) {
          imgList = item.images.split(',').map(s => s.trim());
        }
      } else if (item.url_image || item.image_url || item.photo) {
        imgList = [item.url_image || item.image_url || item.photo];
      }

      imgList = imgList.filter(img => typeof img === 'string' && img.length > 5);

      if (imgList.length === 0) {
        imgList = ['https://via.placeholder.com/300x200?text=Land+Matching'];
      }

      return imgList.slice(0, 8);
    }

    // ฟังก์ชันแสดงรายการบ้าน พร้อมภาพขวาสุดสไลด์ได้ และปุ่ม "คุยกับเจ้าของ" [คำสั่งที่ 1, 2, 3]
    function renderProperties(properties) {
      const container = document.getElementById('resultsContainer');
      if (!properties || properties.length === 0) {
        if (AppState.pagination.offset === 0) {
          container.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">ไม่พบรายการบ้านที่ตรงกับเงื่อนไข</div>';
        }
        return;
      }

      properties.forEach(item => {
        const key = item.postId || item.url || item.id || (item.project + item.salePrice);
        if (AppState.pagination.renderedKeys.has(key)) return;
        AppState.pagination.renderedKeys.add(key);

        const card = document.createElement('div');
        card.style.cssText = 'background: #fff; border-radius: 15px; padding: 15px; margin-bottom: 15px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); border: 1px solid #eee; position: relative;';
        
        const price = item.salePrice || item.rentPrice || 'ไม่ระบุราคา';
        const distanceText = item._distance !== undefined ? ` | 📍 ห่าง ${item._distance.toFixed(1)} กม.` : '';
        const images = getPropertyImages(item);
        
        // สร้าง สไลเดอร์ภาพทางขวา (สูงสุด 8 ภาพ) [คำสั่งที่ 1]
        let imgSliderHtml = `<div class="card-img-slider" onclick="event.stopPropagation();">`;
        images.forEach(imgUrl => {
          imgSliderHtml += `<img src="${imgUrl}" alt="ภาพบ้าน" onerror="this.src='https://via.placeholder.com/300x200?text=Land+Matching';" />`;
        });
        imgSliderHtml += `</div>`;

        const ownerName = (item.facebookPostName || item.owner_name || 'เจ้าของประกาศ').replace(/'/g, "\\'");
        const projectTitle = (item.project || item.facebookPostName || 'ประกาศอสังหาฯ').replace(/'/g, "\\'");
        const propertyId = item.id || item.postId || 101;

        card.innerHTML = `
          <div class="card-flex-container">
            <div class="card-info-left" onclick="showDetailModalByItemKey('${key}')">
              <div>
                <div style="font-size: 15px; font-weight: bold; color: var(--text-main); margin-bottom: 5px; line-height: 1.3;">
                  ${item.project || item.facebookPostName || 'ประกาศอสังหาริมทรัพย์'}
                </div>
                <div style="font-size: 13px; color: #555; margin-bottom: 5px;">
                  📍 ${item.district || ''} ${item.province || ''}${distanceText}
                </div>
              </div>
              <div style="font-size: 17px; font-weight: bold; color: #d9534f; margin-top: 6px;">
                💰 ${price}
              </div>
            </div>
            <div class="card-media-right">
              ${imgSliderHtml}
              <button class="btn-chat-owner" onclick="event.stopPropagation(); openOwnerChat('${propertyId}', '${projectTitle}', '${ownerName}');">
                💬 คุยกับเจ้าของ
              </button>
            </div>
          </div>
        `;

        if (!window.propertyMap) window.propertyMap = {};
        window.propertyMap[key] = item;

        container.appendChild(card);
      });
    }

    function showDetailModalByItemKey(key) {
      if (window.propertyMap && window.propertyMap[key]) {
        showDetailModal(window.propertyMap[key]);
      }
    }

    function showDetailModal(item) {
      stopAIVoiceSpeech(); 
      document.getElementById('modalTitle').innerText = item.project || item.facebookPostName || 'ประกาศ';
      document.getElementById('modalPrice').innerText = item.salePrice || item.rentPrice || 'ไม่ระบุ';
      document.getElementById('modalDesc').innerHTML = item.detail || item.description || 'ไม่มีรายละเอียดเพิ่มเติม';
      
      const deepLinkBtn = document.getElementById('modalDeepLink');
      if (item.url) {
        deepLinkBtn.href = item.url;
        deepLinkBtn.style.display = 'inline-block';
      } else {
        deepLinkBtn.style.display = 'none';
      }
    
      const slider = document.getElementById('modalSlider');
      slider.innerHTML = '';
      const images = getPropertyImages(item);
      images.forEach(imgUrl => {
        const img = document.createElement('img');
        img.src = imgUrl;
        slider.appendChild(img);
      });
      
      document.getElementById('detailModalOverlay').classList.add('active');
    
      const houseSummaryText = `ผู้ใช้เพิ่งเปิดดูบ้านชื่อ ${item.project || item.facebookPostName || 'หลังนี้'} ราคา ${item.salePrice || item.rentPrice || 'ไม่ระบุราคา'} รายละเอียดคือ: ${item.detail || item.description || 'ไม่มีรายละเอียด'} กรุณาสวมบทบาทผู้เชี่ยวชาญพูดสรุปและนำเสนอจุดเด่นของบ้านหลังนี้ให้ผู้ใช้ฟังทันทีสั้นๆ ครับ`;
      
      setTimeout(() => {
        if (typeof sendTextToAI === 'function') sendTextToAI(houseSummaryText);
      }, 500);
    }

    function closeDetailModal() {
      document.getElementById('detailModalOverlay').classList.remove('active');
    }

    function loadNextPage() {
      if (AppState.pagination.isLoading || !AppState.pagination.hasMore) return;
      fetchDatabase({}, getSelectedCriteria(), false, AppState.pagination.lastSearchText || "");
    }

    function retryNextPage() {
      loadNextPage();
    }

    function openUserChatModal() {
      document.getElementById('userChatModalOverlay').classList.add('active');
    }

    function closeUserChatModal() {
      document.getElementById('userChatModalOverlay').classList.remove('active');
    }

    function expandChatZone(zone) {
      const listZone = document.getElementById('chatZoneList');
      const roomZone = document.getElementById('chatZoneRoom');
      if (zone === 'list') {
        listZone.classList.add('expanded');
        listZone.classList.remove('shrunk');
        roomZone.classList.add('shrunk');
        roomZone.classList.remove('expanded');
      } else if (zone === 'room') {
        roomZone.classList.add('expanded');
        roomZone.classList.remove('shrunk');
        listZone.classList.add('shrunk');
        listZone.classList.remove('expanded');
      }
    }

    function selectChatRoom(title, personName) {
      document.getElementById('chatActiveTitle').innerText = `💬 ${title}`;
    }
  </script>
</body>
</html>
