"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import { Avatar, Field, Platform } from "./bits";
import type { Brand, FindResult } from "./types";

function Option({
  name,
  value,
  checked,
  nameAttr,
  logo,
  title,
  detail,
}: {
  name: string;
  value: string;
  checked?: boolean;
  nameAttr?: string;
  logo?: string | null;
  title: string;
  detail?: string;
}) {
  return (
    <label className="opt">
      <input type="radio" name={name} value={value} defaultChecked={checked} data-name={nameAttr || ""} />
      {logo !== undefined ? <Avatar logo={logo} name={title} size="md" /> : null}
      <div className="t"><b>{title}</b>{detail ? <div>{detail}</div> : null}</div>
    </label>
  );
}

export function AddBrandDialog({
  prefill,
  onClose,
  onSaved,
  onError,
}: {
  prefill?: string;
  onClose: () => void;
  onSaved: (id: number) => void;
  onError: (message: string) => void;
}) {
  const [query, setQuery] = useState(prefill || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [found, setFound] = useState<FindResult | null>(null);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (!prefill) return;
    setQuery(prefill);
    search(prefill);
    // The suggestion button opens this dialog with a competitor already chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  async function search(value: string) {
    const text = value.trim();
    if (!text) return;
    setBusy(true);
    setError("");
    try {
      setFound(await api<FindResult>("/api/brands/find", { method: "POST", body: { query: text } }));
      setFormKey((key) => key + 1);
    } catch (err) {
      setFound(null);
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!found) return;
    const data = new FormData(event.currentTarget);
    const facebook = String(data.get("fb") || "");
    const google = String(data.get("g") || "");
    const linkedin = String(data.get("li") || "");
    const facebookOption = event.currentTarget.querySelector<HTMLInputElement>("input[name=fb]:checked");
    const linkedinOption = event.currentTarget.querySelector<HTMLInputElement>("input[name=li]:checked");
    const guess = found.domain ? found.domain.split(".")[0] : found.query;
    const body = {
      name: String(data.get("name") || "").trim() || found.query,
      domain: found.domain || (google.startsWith("d:") ? google.slice(2) : null),
      fbPageId: facebook || null,
      fbPageName: facebookOption?.dataset.name || null,
      googleDomain: google.startsWith("d:") ? google.slice(2) : null,
      googleAdvertiserId: google.startsWith("a:") ? google.slice(2) : null,
      linkedinCompanyId: linkedin || null,
      linkedinCompany: linkedinOption?.dataset.name || null,
      maxAds: Number(data.get("max") || 150),
    };
    if (!body.name) body.name = guess.charAt(0).toUpperCase() + guess.slice(1);
    if (!body.fbPageId && !body.googleDomain && !body.googleAdvertiserId && !body.linkedinCompanyId) {
      onError("Pick at least one platform");
      return;
    }
    setBusy(true);
    try {
      const saved = await api<{ id: number }>("/api/brands", { method: "POST", body });
      onSaved(saved.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save");
      setBusy(false);
    }
  }

  const guess = found ? (found.domain ? found.domain.split(".")[0] : found.query) : "";
  const suggested = found && found.facebook[0]?.name && !found.domain
    ? found.query
    : guess.charAt(0).toUpperCase() + guess.slice(1);

  return (
    <div className="dlg-ov show" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="dlg">
        <div className="dlg-h">
          <h3>Track a brand</h3>
          <p>Type a competitor&apos;s name or website. Ad Spy looks it up in the Meta, Google and LinkedIn ad libraries.</p>
        </div>
        <div className="dlg-b">
          <form className="dlg-search" onSubmit={(event) => { event.preventDefault(); search(query); }}>
            <input value={query} autoFocus placeholder="e.g. Athletic Greens or drinkag1.com" onChange={(event) => setQuery(event.target.value)} />
            <button className="btn btn-primary" type="submit" disabled={busy}>Search</button>
          </form>
          {busy && !found ? <div className="muted searching"><span className="spin" />Searching 3 ad libraries…</div> : null}
          {error ? <div className="badge badge-destructive mt12">{error}</div> : null}
          {found ? (
            <form key={formKey} onSubmit={save}>
              <label className="label">Brand name</label>
              <input name="name" defaultValue={suggested} />
              <div className="pfh"><Platform id="facebook" />Meta (Facebook + Instagram) page</div>
              {found.facebook.map((page, index) => (
                <Option key={page.id} name="fb" value={page.id} checked={index === 0} nameAttr={page.name} logo={page.logo} title={page.name} detail={`${page.category || ""}${page.likes ? ` · ${page.likes.toLocaleString()} likes` : ""}${page.ig ? ` · @${page.ig}` : ""}`} />
              ))}
              {found.facebook.length ? <Option name="fb" value="" title="Skip" /> : <div className="desc">No Meta pages found.</div>}
              <div className="pfh"><Platform id="google" />Google Ads Transparency</div>
              {found.google.domains.map((domain, index) => (
                <Option key={domain} name="g" value={`d:${domain}`} checked={index === 0} title={domain} detail="All advertisers running ads to this domain" />
              ))}
              {found.google.advertisers.map((advertiser) => (
                <Option key={advertiser.id} name="g" value={`a:${advertiser.id}`} title={advertiser.name} detail={`${advertiser.region || ""} · ~${advertiser.ads ?? "?"} ads · advertiser ID`} />
              ))}
              {found.google.domains.length || found.google.advertisers.length ? <Option name="g" value="" title="Skip" /> : <div className="desc">Nothing found. Search by website for Google.</div>}
              <div className="pfh"><Platform id="linkedin" />LinkedIn advertiser</div>
              {found.linkedin.map((company, index) => (
                <Option key={company.id} name="li" value={company.id} checked={index === 0} nameAttr={company.name} logo={company.logo} title={company.name} detail={`company ${company.id} · ${company.ads} recent ad${company.ads === 1 ? "" : "s"} matched`} />
              ))}
              {found.linkedin.length ? <Option name="li" value="" title="Skip" /> : <div className="desc">No LinkedIn ads found under this name.</div>}
              <div className="row2">
                <Field label="Ads per platform per pull">
                  <select name="max" defaultValue="150"><option value="50">50</option><option value="150">150</option><option value="300">300</option></select>
                </Field>
                <div>
                  <label className="label">Cost</label>
                  <div className="desc cost">≈0.2 credits per library page + ≈0.2 (image) to 1 (video) credit per new ad for Gemini.</div>
                </div>
              </div>
              <div className="dlg-f">
                <button className="btn btn-outline" type="button" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" type="submit" disabled={busy}>Track brand</button>
              </div>
            </form>
          ) : <div className="dlg-f"><button className="btn btn-outline" type="button" onClick={onClose}>Cancel</button></div>}
        </div>
      </div>
    </div>
  );
}

export function EditBrandDialog({
  brand,
  onClose,
  onSaved,
  onDeleted,
  onError,
}: {
  brand: Brand;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body: Record<string, string | number | boolean | null> = {};
    for (const key of ["name", "fbPageId", "fbPageName", "googleDomain", "googleAdvertiserId", "linkedinCompanyId", "linkedinCompany"]) {
      body[key] = String(data.get(key) || "").trim();
    }
    body.maxAds = Number(data.get("maxAds") || 150);
    body.active = data.get("active") === "true";
    setBusy(true);
    try {
      await api(`/api/brands/${brand.id}`, { method: "PATCH", body });
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save");
      setBusy(false);
    }
  }
  async function remove() {
    if (!confirm(`Delete ${brand.name} and all ${brand.ads} of its ads from the library?`)) return;
    await api(`/api/brands/${brand.id}`, { method: "DELETE" });
    onDeleted();
  }
  const input = (key: keyof Brand, label: string, placeholder = "") => (
    <Field label={label}><input name={key} defaultValue={brand[key] == null ? "" : String(brand[key])} placeholder={placeholder} /></Field>
  );
  return (
    <div className="dlg-ov show" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="dlg" onSubmit={save}>
        <div className="dlg-h">
          <h3>{brand.name} settings</h3>
          <p>Which ad library accounts this brand pulls from. Leave a field empty to skip that platform.</p>
        </div>
        <div className="dlg-b">
          {input("name", "Name")}
          <div className="row2">{input("fbPageId", "Meta page ID", "108047081396228")}{input("fbPageName", "Meta page name")}</div>
          <div className="row2">{input("googleDomain", "Google: website domain", "example.com")}{input("googleAdvertiserId", "Google: advertiser ID", "AR0…")}</div>
          <div className="row2">{input("linkedinCompanyId", "LinkedIn company ID", "77723284")}{input("linkedinCompany", "LinkedIn company name")}</div>
          <div className="row2">
            <Field label="Ads per platform per pull"><input name="maxAds" type="number" min={10} max={1000} defaultValue={brand.maxAds} /></Field>
            <Field label="Daily pull">
              <select name="active" defaultValue={brand.active ? "true" : "false"}>
                <option value="true">On</option>
                <option value="false">Paused</option>
              </select>
            </Field>
          </div>
        </div>
        <div className="dlg-f">
          <button className="btn btn-ghost danger" type="button" onClick={remove}>Delete brand</button>
          <button className="btn btn-outline" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="submit" disabled={busy}>Save</button>
        </div>
      </form>
    </div>
  );
}
