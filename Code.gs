/**
 * POINTAGE SANTÉ — Backend Google Apps Script
 * Déploiement : Web app, exécuter en tant que "Moi", accès "Tout le monde".
 * Propriétés du script requises : ADMIN_PHONE, ADMIN_PASSWORD (voir README).
 */
const SHEET_ID = '1g5oXpZdWv64DptDHBRdx6ZTrDlEZW5p9wTW7XqY0MPc';
const TZ = 'Africa/Porto-Novo';
const MAX_ACC = 60; // précision GPS maximale acceptée (mètres)
const SCHEMA = {
  Structures: ['id', 'type', 'name', 'start', 'end'],
  Zones: ['id', 'structureId', 'name', 'lat', 'lng', 'rad', 'poly', 'tol', 'by', 'at'],
  Admins: ['phone', 'name', 'structureId', 'salt', 'hash'],
  Agents: ['id', 'nom', 'pre', 'structureId', 'service', 'tel', 'salt', 'hash', 'sigUrl', 'fpUrl', 'created', 'qualif'],
  Declarations: ['id', 'agentId', 'name', 'structureId', 'type', 'start', 'end', 'motif', 'created'],
  Records: ['ref', 'ts', 'agentId', 'name', 'phone', 'structureId', 'structure', 'service', 'type', 'lat', 'lng', 'acc', 'place', 'inZone', 'late', 'fpUrl', 'status']
};
const TYPES = ['Centre de santé', 'Hôpital', 'Bureau de zone', 'Direction Départementale de la Santé'];

/* ============ INSTALLATION : exécuter setup() une seule fois ============ */
function setup() {
  const book = SpreadsheetApp.openById(SHEET_ID);
  Object.keys(SCHEMA).forEach(n => {
    const s = book.getSheetByName(n) || book.insertSheet(n), h = SCHEMA[n];
    s.getRange(1, 1, s.getMaxRows(), h.length).setNumberFormat('@'); // tout en texte
    s.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
    s.setFrozenRows(1);
  });
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('SECRET')) p.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  if (!p.getProperty('FOLDER_ID')) p.setProperty('FOLDER_ID', DriveApp.createFolder('PointageSante').getId());
  Logger.log('Installation terminée. Ajoutez ADMIN_PHONE et ADMIN_PASSWORD dans les propriétés du script.');
}

/* ============ Utilitaires ============ */
const localDay = ts => new Date(new Date(ts).getTime() + 3600e3).toISOString().slice(0, 10); // Bénin = UTC+1, sans changement d'heure
const prop = k => PropertiesService.getScriptProperties().getProperty(k);
const book = () => SpreadsheetApp.openById(SHEET_ID);
const digits = x => String(x || '').replace(/\D/g, '');
function rows(n) {
  const v = book().getSheetByName(n).getDataRange().getValues(), h = v.shift();
  return v.filter(r => r[0] !== '').map(r => Object.fromEntries(h.map((k, i) => [k, String(r[i])])));
}
function add(n, o) { const h = SCHEMA[n]; book().getSheetByName(n).appendRow(h.map(k => o[k] === undefined ? '' : String(o[k]))); }
function patch(n, key, val, o) {
  const s = book().getSheetByName(n), v = s.getDataRange().getValues(), h = v[0], c = h.indexOf(key);
  for (let i = 1; i < v.length; i++) if (String(v[i][c]) === String(val)) { Object.keys(o).forEach(k => s.getRange(i + 1, h.indexOf(k) + 1).setValue(String(o[k]))); return true; }
  return false;
}
function del(n, key, val) {
  const s = book().getSheetByName(n), v = s.getDataRange().getValues(), c = v[0].indexOf(key);
  for (let i = v.length - 1; i >= 1; i--) if (String(v[i][c]) === String(val)) s.deleteRow(i + 1);
}
const hashPw = (salt, pw) => Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + pw));
const newId = () => Utilities.getUuid().slice(0, 8).toUpperCase();
function sign(p) {
  const b = Utilities.base64EncodeWebSafe(JSON.stringify(p));
  return b + '.' + Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(b, prop('SECRET')));
}
function verify(t) {
  const [b, s] = String(t || '').split('.');
  if (!b || !s || s !== Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(b, prop('SECRET')))) throw new Error('Session invalide');
  const p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(b)).getDataAsString());
  if (p.exp < Date.now()) throw new Error('Session expirée, reconnectez-vous');
  return p;
}
const tok = (role, id, extra) => sign(Object.assign({ role, id, exp: Date.now() + 12 * 3600e3 }, extra || {}));
function saveImg(dataUrl, name) {
  if (!dataUrl) return '';
  const m = /^data:(.+?);base64,(.+)$/.exec(dataUrl);
  if (!m) return '';
  const f = DriveApp.getFolderById(prop('FOLDER_ID')).createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name));
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://lh3.googleusercontent.com/d/' + f.getId();
}
function inPoly(lat, lng, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i][0], xi = poly[i][1], yj = poly[j][0], xj = poly[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
function distSeg(lat, lng, a, b) {
  const k = Math.cos(lat * Math.PI / 180), m = 111320;
  const px = (lng - a[1]) * k * m, py = (lat - a[0]) * m, bx = (b[1] - a[1]) * k * m, by = (b[0] - a[0]) * m, l = bx * bx + by * by;
  const t = l ? Math.max(0, Math.min(1, (px * bx + py * by) / l)) : 0;
  return Math.hypot(px - t * bx, py - t * by);
}
// Distance (m) entre le point et la zone : 0 si à l'intérieur
function zoneDist(z, lat, lng) {
  if (z.poly) {
    const poly = JSON.parse(z.poly);
    if (inPoly(lat, lng, poly)) return 0;
    let m = 1e12; for (let i = 0; i < poly.length; i++) m = Math.min(m, distSeg(lat, lng, poly[i], poly[(i + 1) % poly.length]));
    return m;
  }
  return Math.max(0, dist(lat, lng, +z.lat, +z.lng) - (+z.rad || 150));
}
function dist(a, b, c, d) {
  const r = x => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
}

/* ============ Point d'entrée ============ */
function doGet() { return out({ ok: true, service: 'Pointage Santé' }); }
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const b = JSON.parse(e.postData.contents), fn = ACTIONS[b.action];
    if (!fn) throw new Error('Action inconnue');
    return out({ ok: true, data: fn(b) });
  } catch (err) { return out({ ok: false, error: String(err.message || err) }); }
  finally { try { lock.releaseLock(); } catch (x) {} }
}

/* ============ Actions ============ */
const ACTIONS = {
  structures() {
    const z = rows('Zones');
    return rows('Structures').map(s => ({ id: s.id, type: s.type, name: s.name, zones: z.filter(x => x.structureId === s.id).length }));
  },
  register(b) {
    const tel = digits(b.tel);
    if (!b.nom || !b.pre || !String(b.qualif || '').trim() || !tel || !b.structureId || !/^\d{4,6}$/.test(b.pin || '')) throw new Error('Champs incomplets (code PIN : 4 à 6 chiffres)');
    if (!b.sig) throw new Error('La signature est obligatoire');
    if (rows('Agents').some(a => digits(a.tel) === tel)) throw new Error('Ce numéro est déjà enregistré');
    const st = rows('Structures').find(s => s.id === b.structureId);
    if (!st) throw new Error('Structure inconnue');
    const id = newId(), salt = Utilities.getUuid();
    add('Agents', { id, nom: b.nom.trim(), pre: b.pre.trim(), structureId: st.id, service: st.type === 'Hôpital' ? (b.service || '') : '', tel, salt, hash: hashPw(salt, b.pin),
      sigUrl: saveImg(b.sig, 'sig-' + id + '.png'), fpUrl: '', created: new Date().toISOString(), qualif: String(b.qualif).trim().slice(0, 80) });
    return { token: tok('agent', id) };
  },
  login(b) {
    const a = rows('Agents').find(x => digits(x.tel) === digits(b.tel));
    if (!a || a.hash !== hashPw(a.salt, b.pin || '')) throw new Error('Numéro ou code PIN incorrect');
    return { token: tok('agent', a.id) };
  },
  adminLogin(b) {
    const tel = digits(b.tel);
    const AP = String(prop('ADMIN_PASSWORD') || '').trim();
    if (tel && tel === digits(prop('ADMIN_PHONE')) && AP && String(b.password || '').trim() === AP) return { token: tok('platform', tel) };
    const a = rows('Admins').find(x => digits(x.phone) === tel);
    if (!a || a.hash !== hashPw(a.salt, b.password || '')) throw new Error('Identifiants incorrects');
    return { token: tok('structure', tel, { structureId: a.structureId }) };
  },
  me(b) {
    const s = verify(b.token); if (s.role !== 'agent') throw new Error('Accès refusé');
    const a = rows('Agents').find(x => x.id === s.id); if (!a) throw new Error('Agent introuvable');
    const st = rows('Structures').find(x => x.id === a.structureId) || {};
    return { id: a.id, nom: a.nom, pre: a.pre, service: a.service, structure: st.type + ' — ' + st.name };
  },
  myMonth(b) {
    const s = verify(b.token); if (s.role !== 'agent') throw new Error('Accès refusé');
    const m = /^\d{4}-\d{2}$/.test(b.month || '') ? b.month : Utilities.formatDate(new Date(), TZ, 'yyyy-MM');
    const a = rows('Agents').find(x => x.id === s.id), st = rows('Structures').find(x => x.id === a.structureId) || {};
    const recs = rows('Records').filter(r => r.agentId === a.id && r.status !== 'refusé').map(r => {
      const d = new Date(r.ts);
      return { day: Utilities.formatDate(d, TZ, 'yyyy-MM-dd'), time: Utilities.formatDate(d, TZ, 'HH:mm'), type: r.type, late: r.late, inZone: r.inZone, place: r.place };
    }).filter(r => r.day.slice(0, 7) === m).sort((x, y) => (x.day + x.time).localeCompare(y.day + y.time));
    const dec = rows('Declarations').filter(d => d.agentId === a.id && d.start <= m + '-31' && d.end >= m + '-01').sort((x, y) => y.created.localeCompare(x.created));
    return { decl: dec, month: m, today: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), start: st.start || '08:00', end: st.end || '17:00', records: recs };
  },
  punch(b) {
    const s = verify(b.token); if (s.role !== 'agent') throw new Error('Accès refusé');
    const a = rows('Agents').find(x => x.id === s.id), st = rows('Structures').find(x => x.id === a.structureId);
    const lat = +b.lat, lng = +b.lng, acc = Math.round(+b.acc || 0);
    if (!isFinite(lat) || !isFinite(lng)) throw new Error('Position GPS obligatoire');
    if (b.type !== 'arrivee' && b.type !== 'depart') throw new Error('Type invalide');
    if (acc > MAX_ACC) throw new Error('Signal GPS trop imprécis (± ' + acc + ' m). Sortez à l’air libre, attendez quelques secondes et réessayez.');
    const zones = rows('Zones').filter(z => z.structureId === st.id);
    if (!zones.length) throw new Error('Aucune zone de travail n’est définie pour votre structure. Contactez l’administrateur.');
    let best = 1e12, hit = null;
    zones.forEach(z => { const d = zoneDist(z, lat, lng); best = Math.min(best, d); if (!hit && d <= (z.tol === '' ? 20 : +z.tol)) hit = z; });
    let addr = '';
    try { addr = Maps.newGeocoder().setLanguage('fr').reverseGeocode(lat, lng).results[0].formatted_address; } catch (e) { addr = lat.toFixed(5) + ', ' + lng.toFixed(5); }
    const now = new Date(), hm = Utilities.formatDate(now, TZ, 'HH:mm'), ref = Utilities.formatDate(now, TZ, 'yyyyMMdd') + '-' + newId().slice(0, 5);
    const rec = { ref, ts: now.toISOString(), agentId: a.id, name: a.pre + ' ' + a.nom, phone: a.tel, structureId: st.id, structure: st.type + ' — ' + st.name, service: a.service,
      type: b.type, lat, lng, acc, place: hit ? hit.name + ' (' + addr + ')' : 'HORS ZONE à ' + Math.round(best) + ' m — ' + addr, inZone: hit ? 'oui' : 'non',
      late: hit && b.type === 'arrivee' && hm > (st.start || '08:00') ? 'oui' : 'non', fpUrl: '', status: hit ? 'valide' : 'refusé' };
    add('Records', rec);
    if (!hit) throw new Error('Pointage refusé : vous êtes hors de la zone de travail (à environ ' + Math.round(best) + ' m). La tentative a été enregistrée.');
    return rec;
  },
  adminData(b) {
    const s = verify(b.token), plat = s.role === 'platform';
    if (!plat && s.role !== 'structure') throw new Error('Accès refusé');
    const ok = x => plat || x.structureId === s.structureId, dt = /^\d{4}-\d{2}-\d{2}$/,
      from = dt.test(b.from || '') ? b.from : '', to = dt.test(b.to || '') ? b.to : '',
      safe = a => ({ id: a.id, nom: a.nom, pre: a.pre, qualif: a.qualif, structureId: a.structureId, service: a.service, tel: a.tel, sigUrl: a.sigUrl, created: a.created });
    let recs = rows('Records').filter(ok);
    if (from && to) recs = recs.filter(r => { const d = localDay(r.ts); return d >= from && d <= to; });
    recs.sort((x, y) => y.ts.localeCompare(x.ts));
    return { role: s.role, structures: rows('Structures').filter(x => plat || x.id === s.structureId), zones: rows('Zones').filter(ok), agents: rows('Agents').filter(ok).map(safe),
      records: recs.slice(0, 5000), declarations: rows('Declarations').filter(ok).filter(d => !from || !to || (d.start <= to && d.end >= from)).sort((x, y) => y.created.localeCompare(x.created)),
      admins: plat ? rows('Admins').map(a => ({ phone: a.phone, name: a.name, structureId: a.structureId })) : [] };
  },
  declare(b) {
    const s = verify(b.token); if (s.role !== 'agent') throw new Error('Accès refusé');
    const a = rows('Agents').find(x => x.id === s.id), dt = /^\d{4}-\d{2}-\d{2}$/;
    if (!['mission', 'permission', 'absence', 'conge'].includes(b.type)) throw new Error('Type invalide');
    if (!dt.test(b.start || '') || !dt.test(b.end || '') || b.end < b.start) throw new Error('Dates invalides');
    if ((new Date(b.end) - new Date(b.start)) / 864e5 > 365) throw new Error('Période trop longue (365 jours maximum)');
    add('Declarations', { id: 'D' + newId(), agentId: a.id, name: a.pre + ' ' + a.nom, structureId: a.structureId, type: b.type, start: b.start, end: b.end, motif: String(b.motif || '').trim().slice(0, 200), created: new Date().toISOString() });
    return 1;
  },
  cancelDeclaration(b) {
    const s = verify(b.token), d = rows('Declarations').find(x => x.id === b.id);
    if (!d) throw new Error('Déclaration introuvable');
    if (!(s.role === 'platform' || (s.role === 'agent' && d.agentId === s.id) || (s.role === 'structure' && d.structureId === s.structureId))) throw new Error('Accès refusé');
    del('Declarations', 'id', b.id); return 1;
  },
  setQualif(b) {
    const s = verify(b.token); if (s.role !== 'platform' && s.role !== 'structure') throw new Error('Accès refusé');
    const a = rows('Agents').find(x => x.id === b.agentId);
    if (!a || (s.role === 'structure' && a.structureId !== s.structureId)) throw new Error('Accès refusé');
    patch('Agents', 'id', a.id, { qualif: String(b.qualif || '').trim().slice(0, 80) }); return 1;
  },
  // Signatures (images) des agents, pour l'export du registre
  signatures(b) {
    const s = verify(b.token); if (s.role !== 'platform' && s.role !== 'structure') throw new Error('Accès refusé');
    const ids = (b.ids || []).slice(0, 300), out = {};
    rows('Agents').filter(a => ids.includes(a.id) && (s.role === 'platform' || a.structureId === s.structureId)).forEach(a => {
      const m = /\/d\/([\w-]+)/.exec(a.sigUrl || ''); if (!m) return;
      try { const bl = DriveApp.getFileById(m[1]).getBlob(); out[a.id] = 'data:' + bl.getContentType() + ';base64,' + Utilities.base64Encode(bl.getBytes()); } catch (x) {}
    });
    return out;
  },
  saveStructure(b) { platform(b); if (!TYPES.includes(b.type) || !b.name) throw new Error('Type et nom requis'); add('Structures', { id: 'S' + newId(), type: b.type, name: b.name.trim(), start: b.start || '08:00', end: b.end || '17:00' }); return 1; },
  deleteStructure(b) { platform(b); del('Structures', 'id', b.id); del('Zones', 'structureId', b.id); return 1; },
  addZone(b) {
    const who = zoneAuth(b, b.structureId); let lat = b.lat, lng = b.lng, poly = '';
    if (Array.isArray(b.poly) && b.poly.length) {
      if (b.poly.length < 3) throw new Error('Au moins 3 points sont nécessaires');
      const pts = b.poly.map(p => [+p[0], +p[1]]); poly = JSON.stringify(pts);
      lat = pts.reduce((t, p) => t + p[0], 0) / pts.length; lng = pts.reduce((t, p) => t + p[1], 0) / pts.length;
    }
    add('Zones', { id: 'Z' + newId(), structureId: b.structureId, name: b.name, lat, lng, rad: b.rad || '', poly, tol: b.tol === undefined || b.tol === '' ? 20 : b.tol, by: who, at: new Date().toISOString() });
    return 1;
  },
  deleteZone(b) { const z = rows('Zones').find(x => x.id === b.id); if (!z) throw new Error('Zone introuvable'); zoneAuth(b, z.structureId); del('Zones', 'id', b.id); return 1; },
  addAdmin(b) {
    platform(b); const phone = digits(b.phone);
    if (!phone || !b.password || b.password.length < 6) throw new Error('Téléphone et mot de passe (6+ caractères) requis');
    const salt = Utilities.getUuid(), rec = { phone, name: b.name, structureId: b.structureId, salt, hash: hashPw(salt, b.password) };
    if (rows('Admins').some(a => digits(a.phone) === phone)) patch('Admins', 'phone', phone, rec); else add('Admins', rec); return 1;
  },
  deleteAdmin(b) { platform(b); del('Admins', 'phone', digits(b.phone)); return 1; }
};
// Autorise l'administrateur de la plateforme, ou l'administrateur de la structure concernée. Retourne son nom (traçabilité).
function zoneAuth(b, structureId) {
  const s = verify(b.token);
  if (s.role === 'platform') return 'Administrateur plateforme';
  if (s.role === 'structure' && String(s.structureId) === String(structureId)) {
    const a = rows('Admins').find(x => digits(x.phone) === digits(s.id));
    return 'Admin structure : ' + (a ? a.name : s.id);
  }
  throw new Error('Vous ne pouvez modifier que la zone de votre structure');
}
function platform(b) { if (verify(b.token).role !== 'platform') throw new Error('Réservé à l’administrateur de la plateforme'); }

/* Diagnostic : exécutez cette fonction dans l'éditeur puis ouvrez Affichage > Journaux d'exécution */
function diagnostic() {
  const p = PropertiesService.getScriptProperties().getProperties();
  Logger.log('Propriétés présentes : ' + Object.keys(p).join(', '));
  Logger.log('ADMIN_PHONE : ' + (p.ADMIN_PHONE ? 'chiffres retenus = ' + digits(p.ADMIN_PHONE) : 'ABSENTE'));
  Logger.log('ADMIN_PASSWORD : ' + (p.ADMIN_PASSWORD ? String(p.ADMIN_PASSWORD).trim().length + ' caractères' : 'ABSENTE'));
  Logger.log('SECRET : ' + (p.SECRET ? 'ok' : 'ABSENTE (lancez setup())'));
}
