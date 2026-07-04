import { useCallback, useState } from "react";
import { ConfigCrypto } from "../sync/ConfigCrypto";
import { S3Adapter } from "../storage/S3Adapter";
import type { SyncConfig } from "../document/types";
import { DOC_CONSTANTS } from "../document/constants";
import "./SettingsDialog.scss";

interface SettingsDialogProps { isOpen: boolean; onClose: () => void; onConfigSaved: (config: SyncConfig) => void; onConfigCleared: () => void }
type Tab = "sync" | "local";

export const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose, onConfigSaved, onConfigCleared }) => {
  const [tab, setTab] = useState<Tab>("sync");
  const [form, setForm] = useState({ endpoint: "", bucket: "", accessKey: "", secretKey: "", region: "us-east-1", pathPrefix: "" });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [exportStr, setExportStr] = useState("");
  const [importStr, setImportStr] = useState("");
  const [password, setPassword] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const loadExisting = useCallback(() => { const saved = localStorage.getItem(DOC_CONSTANTS.SYNC_CONFIG_KEY); if (saved) { try { const c: SyncConfig = JSON.parse(saved); setForm({ endpoint: c.endpoint || "", bucket: c.bucket || "", accessKey: c.accessKey || "", secretKey: c.secretKey || "", region: c.region || "us-east-1", pathPrefix: c.pathPrefix || "" }); } catch {} } }, []);
  if (isOpen && !form.endpoint && !form.bucket) { loadExisting(); }

  const buildConfig = (): SyncConfig => ({ type: "s3", endpoint: form.endpoint, bucket: form.bucket, accessKey: form.accessKey, secretKey: form.secretKey, region: form.region || undefined, pathPrefix: form.pathPrefix || undefined });
  const handleTest = async () => { setTesting(true); setTestResult(null); try { const a = new S3Adapter(buildConfig()); await a.testConnection(); setTestResult("Connection successful!"); } catch(e: any) { setTestResult(`Connection failed: ${e.message}`); } setTesting(false); };
  const handleSave = () => { const c = buildConfig(); localStorage.setItem(DOC_CONSTANTS.SYNC_CONFIG_KEY, JSON.stringify(c)); onConfigSaved(c); onClose(); };
  const handleClear = () => { localStorage.removeItem(DOC_CONSTANTS.SYNC_CONFIG_KEY); setForm({ endpoint: "", bucket: "", accessKey: "", secretKey: "", region: "us-east-1", pathPrefix: "" }); onConfigCleared(); };
  const handleExport = async () => { if (!password) { alert("Please enter a password"); return; } try { const e = await ConfigCrypto.encrypt(buildConfig(), password); setExportStr(e); setShowExport(true); } catch(e: any) { alert(`Export failed: ${e.message}`); } };
  const handleImport = async () => { if (!importStr || !password) { alert("Paste config and enter password"); return; } try { const c = await ConfigCrypto.decrypt(importStr, password); setForm({ endpoint: c.endpoint, bucket: c.bucket, accessKey: c.accessKey, secretKey: c.secretKey, region: c.region || "us-east-1", pathPrefix: c.pathPrefix || "" }); setShowImport(false); setImportStr(""); setPassword(""); } catch(e: any) { alert(`Import failed: ${e.message || "Wrong password"}`); } };
  const handleBackdropClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); };

  if (!isOpen) return null;
  return (
    <div className="settings-dialog__backdrop" onClick={handleBackdropClick}>
      <div className="settings-dialog">
        <div className="settings-dialog__header"><h2>Settings</h2><button className="settings-dialog__close" onClick={onClose}>×</button></div>
        <div className="settings-dialog__tabs"><button className={`settings-dialog__tab ${tab==="sync"?"settings-dialog__tab--active":""}`} onClick={()=>setTab("sync")}>Cloud Sync</button><button className={`settings-dialog__tab ${tab==="local"?"settings-dialog__tab--active":""}`} onClick={()=>setTab("local")}>Local</button></div>
        <div className="settings-dialog__body">
          {tab==="sync"&&(<div className="settings-dialog__sync">
            <div className="settings-dialog__field"><label>Endpoint URL</label><input type="url" placeholder="https://s3.amazonaws.com" value={form.endpoint} onChange={e=>setForm({...form,endpoint:e.target.value})}/></div>
            <div className="settings-dialog__field"><label>Bucket Name</label><input type="text" placeholder="my-excalidraw-bucket" value={form.bucket} onChange={e=>setForm({...form,bucket:e.target.value})}/></div>
            <div className="settings-dialog__field"><label>Access Key</label><input type="text" placeholder="AKIAIOSFODNN7EXAMPLE" value={form.accessKey} onChange={e=>setForm({...form,accessKey:e.target.value})}/></div>
            <div className="settings-dialog__field"><label>Secret Key</label><input type="password" placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" value={form.secretKey} onChange={e=>setForm({...form,secretKey:e.target.value})}/></div>
            <div className="settings-dialog__field"><label>Region</label><input type="text" placeholder="us-east-1" value={form.region} onChange={e=>setForm({...form,region:e.target.value})}/></div>
            <div className="settings-dialog__field"><label>Path Prefix (optional)</label><input type="text" placeholder="excalidraw/" value={form.pathPrefix} onChange={e=>setForm({...form,pathPrefix:e.target.value})}/></div>
            <div className="settings-dialog__actions">
              <button className="settings-dialog__btn" onClick={handleTest} disabled={testing}>{testing?"Testing...":"Test Connection"}</button>
              <button className="settings-dialog__btn settings-dialog__btn--primary" onClick={handleSave}>Save</button>
              <button className="settings-dialog__btn settings-dialog__btn--danger" onClick={handleClear}>Clear Config</button>
            </div>
            {testResult&&<div className={`settings-dialog__test-result ${testResult.includes("successful")?"settings-dialog__test-result--success":"settings-dialog__test-result--error"}`}>{testResult}</div>}
            <div className="settings-dialog__export-import">
              <h3>Config Export / Import</h3>
              <div className="settings-dialog__field"><label>Encryption Password</label><input type="password" placeholder="Enter password" value={password} onChange={e=>setPassword(e.target.value)}/></div>
              <div className="settings-dialog__actions"><button className="settings-dialog__btn" onClick={handleExport}>Export Config</button><button className="settings-dialog__btn" onClick={()=>setShowImport(!showImport)}>Import Config</button></div>
              {showExport&&exportStr&&<div className="settings-dialog__export-result"><label>Encrypted Config (copy this):</label><textarea readOnly value={exportStr} onClick={e=>(e.target as HTMLTextAreaElement).select()}/></div>}
              {showImport&&<div className="settings-dialog__import-form"><label>Paste Encrypted Config:</label><textarea value={importStr} onChange={e=>setImportStr(e.target.value)} placeholder="Paste encrypted config..."/><button className="settings-dialog__btn settings-dialog__btn--primary" onClick={handleImport}>Decrypt & Apply</button></div>}
            </div>
          </div>)}
          {tab==="local"&&<div className="settings-dialog__local"><p>Local storage is used for offline-first document editing.</p><p>Documents are stored in IndexedDB and automatically synced when online.</p><button className="settings-dialog__btn settings-dialog__btn--danger">Clear Local Cache</button></div>}
        </div>
      </div>
    </div>
  );
};
