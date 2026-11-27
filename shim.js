/* Dimeleslift · capa de conexión
   Reemplaza el runtime de Claude (window.claude) por Supabase:
   login con correo y contraseña, base de datos en tiempo real, videos y correos
   enviados por la propia app desde hola@dimeleslift.com. */
(function () {
  "use strict";
  const cfg = window.DLL_CONFIG || {};
  const APP = cfg.APP_URL ? cfg.APP_URL.replace(/\/?$/, "/") : location.origin + location.pathname;

  // ¿Viene de un correo de invitación o de "crear/cambiar contraseña"? (antes de que Supabase limpie la URL)
  const hashType = new URLSearchParams(location.hash.replace(/^#/, "")).get("type") || "";
  let needsPassword = hashType === "invite" || hashType === "recovery";

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.__sb = sb;

  let resolveSession;
  const sessionP = new Promise(r => (resolveSession = r));
  let session = null;

  function mapErr(e) {
    const msg = (e && e.message) || String(e);
    const x = new Error(msg);
    const c = e && (e.code || e.statusCode);
    x.code = c === "42501" || /row-level security|permission|not allowed|unauthorized/i.test(msg) ? "invalid_argument"
      : /quota|exceed|too large|payload/i.test(msg) || c === "413" ? "quota_exceeded"
      : "unknown";
    return x;
  }

  /* ---------------- Login ---------------- */
  const css = `
  #dll-login{position:fixed;inset:0;z-index:9999;background:#000000;color:#F4F1EC;display:flex;align-items:center;justify-content:center;padding:20px;font-family:"League Spartan",system-ui,sans-serif}
  #dll-login .box{width:100%;max-width:380px;background:#141414;border:1px solid #2A2A2A;border-radius:20px;padding:28px}
  #dll-login .logo{font-family:"Nunito Sans",system-ui,sans-serif;font-weight:400;letter-spacing:-.01em;font-size:30px;line-height:1;margin-bottom:6px}
  #dll-login .logo b{color:#DA45A4;font-weight:800;letter-spacing:-.02em}
  #dll-login h1{font-family:"League Spartan","Arial Black",sans-serif;font-size:20px;margin:16px 0 6px}
  #dll-login p{color:#B8B3AB;font-size:14px;margin:0 0 14px}
  #dll-login label{display:block;font-size:13px;color:#B8B3AB;margin:0 0 4px}
  #dll-login input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:1px solid #3A3A3A;background:#000000;color:#F4F1EC;font-size:16px;margin-bottom:10px}
  #dll-login button{width:100%;padding:12px;border:0;border-radius:999px;background:#A3E850;color:#000;font-weight:800;text-transform:uppercase;letter-spacing:.06em;font-size:15px;cursor:pointer}
  #dll-login button[disabled]{opacity:.6}
  #dll-login .link{background:none;color:#B8B3AB;font-weight:600;margin-top:8px;text-decoration:underline}
  #dll-login .err{color:#ff6b6b;font-size:13px;min-height:18px}
  #dll-login .ok{color:#A3E850;font-size:13px;min-height:18px}
  #dll-out{position:fixed;left:12px;bottom:12px;z-index:50;background:#000000;color:#B8B3AB;border:1px solid #3A3A3A;border-radius:999px;padding:6px 12px;font:600 12px "League Spartan",sans-serif;cursor:pointer}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const $ = id => document.getElementById(id);
  const okMail = e => /^\S+@\S+\.\S+$/.test(e);

  function shell(inner) {
    let d = $("dll-login");
    if (!d) { d = document.createElement("div"); d.id = "dll-login"; document.body.appendChild(d); }
    d.innerHTML = `<div class="box"><div class="logo">dime<b>LES</b>lift</div>${inner}</div>`;
    return d;
  }

  function loginUI() {
    shell(`
      <div id="dll-step1">
        <h1>Entra a tu espacio</h1>
        <p>Entra con el correo con que te inscribió Les y tu contraseña.</p>
        <label for="dll-email">Correo</label>
        <input type="email" id="dll-email" placeholder="tucorreo@gmail.com" autocomplete="email">
        <label for="dll-pass">Contraseña</label>
        <input type="password" id="dll-pass" placeholder="Tu contraseña" autocomplete="current-password">
        <div class="err" id="dll-err1"></div>
        <button id="dll-in">Entrar</button>
        <button class="link" id="dll-forgot">¿Primera vez u olvidaste tu contraseña?</button>
      </div>
      <div id="dll-step2" style="display:none">
        <h1>Crea o recupera tu contraseña</h1>
        <p>Escribe tu correo y te mandamos un enlace para crear una contraseña nueva.</p>
        <label for="dll-email2">Correo</label>
        <input type="email" id="dll-email2" placeholder="tucorreo@gmail.com" autocomplete="email">
        <div class="err" id="dll-err2"></div>
        <div class="ok" id="dll-ok2"></div>
        <button id="dll-reset">Enviarme el enlace</button>
        <button class="link" id="dll-back">Volver a entrar</button>
      </div>`);

    $("dll-in").onclick = async () => {
      const email = $("dll-email").value.trim().toLowerCase();
      const password = $("dll-pass").value;
      if (!okMail(email)) { $("dll-err1").textContent = "Revisa el correo."; return; }
      if (!password) { $("dll-err1").textContent = "Escribe tu contraseña."; return; }
      $("dll-in").disabled = true; $("dll-err1").textContent = "";
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (!$("dll-in")) return;
      $("dll-in").disabled = false;
      if (error) $("dll-err1").textContent = /confirm/i.test(error.message)
        ? "Primero confirma tu correo con el enlace que te llegó."
        : "Correo o contraseña incorrectos. Si es tu primera vez, toca el enlace de abajo.";
    };
    $("dll-pass").onkeydown = e => { if (e.key === "Enter") $("dll-in").click(); };
    $("dll-email").onkeydown = e => { if (e.key === "Enter") $("dll-pass").focus(); };
    $("dll-forgot").onclick = () => {
      $("dll-email2").value = $("dll-email").value;
      $("dll-step1").style.display = "none"; $("dll-step2").style.display = "";
    };
    $("dll-back").onclick = () => { $("dll-step2").style.display = "none"; $("dll-step1").style.display = ""; };
    $("dll-reset").onclick = async () => {
      const email = $("dll-email2").value.trim().toLowerCase();
      if (!okMail(email)) { $("dll-err2").textContent = "Revisa el correo."; return; }
      $("dll-reset").disabled = true; $("dll-err2").textContent = ""; $("dll-ok2").textContent = "";
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: APP });
      $("dll-reset").disabled = false;
      if (error) { $("dll-err2").textContent = /rate|seconds/i.test(error.message) ? "Espera un minuto antes de pedir otro enlace." : "No se pudo enviar. Intenta de nuevo."; return; }
      $("dll-ok2").textContent = "Listo. Revisa tu correo (también en spam) y toca el botón para crear tu contraseña.";
    };
  }

  function passwordUI(s) {
    shell(`
      <h1>Crea tu contraseña</h1>
      <p>Con ella vas a entrar siempre a la app con <b>${(s.user.email || "").replace(/</g, "")}</b>.</p>
      <label for="dll-p1">Contraseña nueva</label>
      <input type="password" id="dll-p1" placeholder="Mínimo 8 caracteres" autocomplete="new-password">
      <label for="dll-p2">Repítela</label>
      <input type="password" id="dll-p2" placeholder="Repite la contraseña" autocomplete="new-password">
      <div class="err" id="dll-errp"></div>
      <button id="dll-save">Guardar y entrar</button>`);
    $("dll-save").onclick = async () => {
      const p1 = $("dll-p1").value, p2 = $("dll-p2").value;
      if (p1.length < 8) { $("dll-errp").textContent = "Usa al menos 8 caracteres."; return; }
      if (p1 !== p2) { $("dll-errp").textContent = "Las contraseñas no coinciden."; return; }
      $("dll-save").disabled = true; $("dll-errp").textContent = "";
      const { error } = await sb.auth.updateUser({ password: p1 });
      if (error) {
        $("dll-save").disabled = false;
        $("dll-errp").textContent = /same|different/i.test(error.message) ? "Elige una contraseña distinta a la anterior." : "No se pudo guardar. Intenta de nuevo.";
        return;
      }
      needsPassword = false;
      history.replaceState(null, "", location.pathname);
      enterApp(s);
    };
    $("dll-p2").onkeydown = e => { if (e.key === "Enter") $("dll-save").click(); };
  }

  function signOutBtn() {
    if ($("dll-out")) return;
    const b = document.createElement("button"); b.id = "dll-out"; b.textContent = "Salir";
    b.onclick = async () => { await sb.auth.signOut(); location.reload(); };
    document.body.appendChild(b);
  }

  function enterApp(s) {
    if (session) return;
    session = s;
    $("dll-login")?.remove();
    signOutBtn();
    // Asegura su perfil (correo) para que la coach lo vea
    sb.from("profiles").upsert({ id: s.user.id, email: (s.user.email || "").toLowerCase() }).then(() => {}, () => {});
    resolveSession(s);
  }

  function onSession(s) {
    if (session || !s) return;
    if (needsPassword) { passwordUI(s); return; }
    enterApp(s);
  }

  const whenBody = fn => (document.body ? fn() : addEventListener("DOMContentLoaded", fn));
  sb.auth.onAuthStateChange((ev, s) => {
    if (ev === "PASSWORD_RECOVERY") needsPassword = true;
    if (s) whenBody(() => onSession(s));
  });
  sb.auth.getSession().then(({ data }) => {
    if (data.session) whenBody(() => onSession(data.session));
    else whenBody(() => { if (!session && !$("dll-login")) loginUI(); });
  });

  /* ---------------- Base de datos ---------------- */
  const listeners = {};
  const timers = {};
  const split = path => { const i = path.indexOf("/"); return [path.slice(0, i), path.slice(i + 1)]; };

  async function refresh(col) {
    const ls = listeners[col]; if (!ls) return;
    const { data, error } = await sb.from("docs").select("id,data").eq("collection", col);
    if (error) { ls.forEach(l => l.bad && l.bad(mapErr(error))); return; }
    const snap = { docs: data.map(r => ({ id: r.id, exists: true, data: () => r.data })), metadata: { fromCache: false } };
    ls.forEach(l => { try { l.ok(snap); } catch (e) { console.error(e); } });
  }
  function soon(col) { clearTimeout(timers[col]); timers[col] = setTimeout(() => refresh(col), 60); }
  const refreshAll = () => Object.keys(listeners).forEach(soon);

  let channel = null;
  function ensureChannel() {
    if (channel) return;
    channel = sb.channel("dll-docs")
      .on("postgres_changes", { event: "*", schema: "public", table: "docs" }, p => {
        const col = (p.new && p.new.collection) || (p.old && p.old.collection);
        col ? soon(col) : refreshAll();
      })
      .subscribe();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshAll(); });
    setInterval(() => { if (!document.hidden) refreshAll(); }, 60000);
  }

  const pendingPatches = new Map();
  const isMap = value => value !== null && typeof value === "object" && !Array.isArray(value);

  function recordChanges(before, after, path = []) {
    if (before === after) return [];
    if (!isMap(after)) {
      return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ path, value: after }];
    }
    const old = isMap(before) ? before : {};
    const keys = new Set([...Object.keys(old), ...Object.keys(after)]);
    return [...keys].flatMap(key => {
      const field = [...path, key];
      if (!Object.hasOwn(after, key)) return [{ path: field, remove: true }];
      return recordChanges(Object.hasOwn(old, key) ? old[key] : undefined, after[key], field);
    });
  }

  function applyRecordChanges(data, changes) {
    const next = JSON.parse(JSON.stringify(data || {}));
    for (const { path, value, remove } of changes) {
      let target = next;
      for (const key of path.slice(0, -1)) {
        if (!Object.hasOwn(target, key) || !isMap(target[key])) {
          if (remove) { target = null; break; }
          Object.defineProperty(target, key, { value: {}, writable: true, enumerable: true, configurable: true });
        }
        target = target[key];
      }
      if (!target) continue;
      const key = path[path.length - 1];
      if (remove) delete target[key];
      else Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
    }
    return next;
  }

  async function patchRecord(col, id, changes) {
    // A competing write invalidates the timestamp filter. Read again and reapply only the changed fields.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: row, error: readError } = await sb.from("docs")
        .select("data,updated_at").eq("collection", col).eq("id", id).maybeSingle();
      if (readError) throw mapErr(readError);
      if (!changes.length) return row?.data || {};
      const next = applyRecordChanges(row?.data, changes);
      const updated_at = new Date(Math.max(Date.now(), (Date.parse(row?.updated_at) || 0) + 1)).toISOString();
      if (!row) {
        const { error } = await sb.from("docs").insert({ collection: col, id, data: next, updated_at });
        if (error?.code === "23505") continue;
        if (error) throw mapErr(error);
        return next;
      }
      const update = sb.from("docs").update({ data: next, updated_at }).eq("collection", col).eq("id", id);
      const versioned = row.updated_at == null ? update.is("updated_at", null) : update.eq("updated_at", row.updated_at);
      const { data: saved, error } = await versioned.select("id").maybeSingle();
      if (error) throw mapErr(error);
      if (saved) return next;
    }
    throw new Error("No se pudo guardar después de varios cambios concurrentes.");
  }

  const db = {
    collection(col) {
      return {
        onSnapshot(ok, bad) {
          (listeners[col] ||= []).push({ ok, bad });
          ensureChannel(); refresh(col);
          return () => { listeners[col] = (listeners[col] || []).filter(l => l.ok !== ok); };
        }
      };
    },
    doc(path) {
      const [col, id] = split(path);
      return {
        async set(data) {
          const clean = JSON.parse(JSON.stringify(data ?? {}));
          const { error } = await sb.from("docs").upsert({ collection: col, id, data: clean, updated_at: new Date().toISOString() });
          if (error) throw mapErr(error);
          soon(col);
        },
        async patch(before, after, include) {
          const clean = JSON.parse(JSON.stringify(after));
          const changes = recordChanges(before, clean);
          for (const path of include) {
            const value = path.reduce((field, key) => field?.[key], clean);
            changes.push(value === undefined ? { path, remove: true } : { path, value });
          }
          const previous = pendingPatches.get(path) || Promise.resolve();
          const pending = previous.catch(() => {}).then(() => patchRecord(col, id, changes));
          pendingPatches.set(path, pending);
          try {
            const saved = await pending;
            soon(col);
            return saved;
          } finally {
            if (pendingPatches.get(path) === pending) pendingPatches.delete(path);
          }
        },
        async delete() {
          const { error } = await sb.from("docs").delete().eq("collection", col).eq("id", id);
          if (error) throw mapErr(error);
          soon(col);
        }
      };
    }
  };

  /* ---------------- Usuario ---------------- */
  let ownerP = null;
  const user = {
    async id() { return session.user.id; },
    async isOwner() {
      ownerP ||= sb.rpc("is_coach").then(({ data }) => !!data, () => false);
      return ownerP;
    },
    async me() { return { email: session.user.email || "", name: (session.user.user_metadata || {}).name || "" }; },
    async profiles(ids) {
      const { data, error } = await sb.from("profiles").select("id,email,name").in("id", ids);
      if (error) throw mapErr(error);
      const out = {}; (data || []).forEach(p => (out[p.id] = { email: p.email || "", name: p.name || "" }));
      return out;
    }
  };

  /* ---------------- Videos ---------------- */
  const assets = {
    async upload(file) {
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await sb.storage.from("videos").upload(path, file, { contentType: file.type || "video/mp4", upsert: false });
      if (error) throw mapErr(error);
      return { id: path, url: sb.storage.from("videos").getPublicUrl(path).data.publicUrl };
    },
    async delete(id) {
      const { error } = await sb.storage.from("videos").remove([id]);
      if (error) throw mapErr(error);
    }
  };

  /* ---------------- Correos ----------------
     La app los envía sola desde hola@dimeleslift.com (función "correo" de Supabase):
       "invitar"      → invitación para que el alumno cree su contraseña.
       "send_message" → aviso (ej. programa listo) vía Resend.
     Si el aviso no se puede enviar porque falta la clave de Resend, abre Gmail como respaldo. */
  async function fn(payload) {
    const { data, error } = await sb.functions.invoke("correo", { body: payload });
    if (error) {
      let info = {};
      try { info = await error.context.json(); } catch (_) {}
      const x = new Error(info.msg || info.code || error.message || "No se pudo enviar");
      x.code = info.code || "tool_error";
      throw x;
    }
    return data || { ok: true };
  }
  function gmailFallback(args) {
    const to = (args.to || []).join(",");
    let body = args.body || "";
    if (body.length > 6000) body = body.slice(0, 6000) + "…";
    const cuenta = cfg.MAIL_ACCOUNT || "hola@dimeleslift.com";
    const href = "https://mail.google.com/mail/u/" + encodeURIComponent(cuenta) + "/?view=cm&fs=1&tf=1&to=" + encodeURIComponent(to) +
      "&su=" + encodeURIComponent(args.subject || "") + "&body=" + encodeURIComponent(body);
    window.open(href, "_blank");
  }
  const mcp = {
    async callTool(_server, tool, args) {
      if (tool === "invitar") return fn({ accion: "invitar", email: args.email });
      if (tool === "send_message") {
        try {
          return await fn({ accion: "aviso", to: args.to, subject: args.subject, html: args.htmlBody, text: args.body });
        } catch (e) {
          if (e.code === "sin_clave") { gmailFallback(args); return { ok: true, modo: "gmail" }; }
          throw e;
        }
      }
      throw Object.assign(new Error("No disponible"), { code: "tool_error" });
    }
  };

  window.claude = {
    async use(name) {
      await sessionP;
      if (name === "db") return db;
      if (name === "user") return user;
      if (name === "assets") return assets;
      if (name === "mcp") return mcp;
      throw new Error("Capacidad no disponible: " + name);
    }
  };
})();
