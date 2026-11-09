"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AccountAuthForm } from "@/components/account/account-auth-form";
import { ApiRequestError, ponyoApi, PONYO_API_BASE_URL, type CustomerAddress, type CustomerAddressInput, type CustomerProfile } from "@/services/ponyo-api.client";

const emptyAddress = (profile?: CustomerProfile): CustomerAddressInput => ({
  firstName: profile?.firstName ?? "",
  lastName: profile?.lastName ?? "",
  address1: "",
  address2: "",
  city: "",
  region: "",
  postalCode: "",
  countryCode: "JP",
  phone: "",
  isDefault: false,
});

export function AccountAddressBook() {
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [checking, setChecking] = useState(Boolean(PONYO_API_BASE_URL));
  const [errorMessage, setErrorMessage] = useState(PONYO_API_BASE_URL ? "" : "Connect the Ponyo API to manage saved delivery details.");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerAddressInput>(emptyAddress());
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyAddressId, setBusyAddressId] = useState<string | null>(null);

  const loadAddresses = useCallback(async () => {
    const result = await ponyoApi.getAddresses();
    setAddresses(result);
  }, []);

  useEffect(() => {
    if (!PONYO_API_BASE_URL) return;
    let active = true;
    ponyoApi.getMe().then(async (profile) => {
      if (!active) return;
      setCustomer(profile);
      setForm(emptyAddress(profile));
      const saved = await ponyoApi.getAddresses();
      if (active) setAddresses(saved);
    }).catch((error: unknown) => {
      if (!active) return;
      if (!(error instanceof ApiRequestError && error.status === 401)) {
        setErrorMessage(error instanceof Error ? error.message : "We couldn't load your saved addresses.");
      }
    }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  function beginAdd() {
    setEditingId(null);
    setForm({ ...emptyAddress(customer ?? undefined), isDefault: addresses.length === 0 });
    setErrorMessage("");
    setFormOpen(true);
  }

  function beginEdit(address: CustomerAddress) {
    const addressInput: CustomerAddressInput = {
      firstName: address.firstName, lastName: address.lastName, address1: address.address1,
      address2: address.address2, city: address.city, region: address.region,
      postalCode: address.postalCode, countryCode: address.countryCode, phone: address.phone,
      isDefault: address.isDefault,
    };
    setEditingId(address.id);
    setForm(addressInput);
    setErrorMessage("");
    setFormOpen(true);
  }

  function updateField<K extends keyof CustomerAddressInput>(key: K, value: CustomerAddressInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    const normalized = { ...form, countryCode: form.countryCode.trim().toUpperCase() };
    try {
      if (editingId) await ponyoApi.updateAddress(editingId, normalized);
      else await ponyoApi.createAddress(normalized);
      await loadAddresses();
      setFormOpen(false);
      setEditingId(null);
      setForm(emptyAddress(customer ?? undefined));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "We couldn't save that address.");
    } finally {
      setSaving(false);
    }
  }

  async function makeDefault(address: CustomerAddress) {
    setBusyAddressId(address.id);
    setErrorMessage("");
    const input: CustomerAddressInput = {
      firstName: address.firstName, lastName: address.lastName, address1: address.address1,
      address2: address.address2, city: address.city, region: address.region,
      postalCode: address.postalCode, countryCode: address.countryCode, phone: address.phone,
      isDefault: address.isDefault,
    };
    try {
      await ponyoApi.updateAddress(address.id, { ...input, isDefault: true });
      await loadAddresses();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "We couldn't update your default address.");
    } finally {
      setBusyAddressId(null);
    }
  }

  async function deleteAddress(address: CustomerAddress) {
    if (!window.confirm(`Remove the address for ${address.address1}?`)) return;
    setBusyAddressId(address.id);
    setErrorMessage("");
    try {
      await ponyoApi.deleteAddress(address.id);
      await loadAddresses();
      if (editingId === address.id) setFormOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "We couldn't remove that address.");
    } finally {
      setBusyAddressId(null);
    }
  }

  if (checking) return <section className="account-loading" role="status"><span aria-hidden="true">🪼</span><p>Gathering your delivery details…</p></section>;

  if (!customer) return <div className="account-guest-wrap">
    {errorMessage && <p className="account-service-note" role="status">{errorMessage}</p>}
    <AccountAuthForm mode="login" onAuthenticated={(profile) => {
      setCustomer(profile);
      setForm(emptyAddress(profile));
      void loadAddresses().catch((error: unknown) => setErrorMessage(error instanceof Error ? error.message : "We couldn't load your addresses."));
    }} />
  </div>;

  return <section className="account-hub account-address-page" aria-labelledby="address-book-title">
    <header className="account-subpage-heading">
      <Link href="/account" className="account-back-link"><span aria-hidden="true">←</span> My profile</Link>
      <div className="account-subpage-title-row"><span className="account-subpage-art" aria-hidden="true">🏡</span><div><span className="account-hub-kicker">A SOFTER LANDING</span><h1 id="address-book-title">Delivery addresses</h1><p>Keep your favorite places ready for a plush delivery.</p></div></div>
      {!formOpen && <button className="account-primary-button address-add-button" type="button" onClick={beginAdd}>Add an address <span aria-hidden="true">＋</span></button>}
    </header>

    {errorMessage && <p className="api-form-error" role="alert">{errorMessage}</p>}

    {formOpen && <section className="account-address-form-card" aria-labelledby="address-form-title">
      <header className="account-section-heading"><div><span className="account-section-icon" aria-hidden="true">✉️</span><span><span className="account-hub-kicker">{editingId ? "MAKE A LITTLE UPDATE" : "A NEW HOME FOR YOUR PARCEL"}</span><h2 id="address-form-title">{editingId ? "Edit address" : "Add a delivery address"}</h2></span></div><button type="button" className="account-icon-button" aria-label="Close address form" onClick={() => setFormOpen(false)}>×</button></header>
      <form className="account-address-form" onSubmit={saveAddress}>
        <label>First name<input value={form.firstName} onChange={(event) => updateField("firstName", event.target.value)} autoComplete="given-name" required maxLength={120} /></label>
        <label>Last name<input value={form.lastName} onChange={(event) => updateField("lastName", event.target.value)} autoComplete="family-name" required maxLength={120} /></label>
        <label className="account-field-wide">Address line 1<input value={form.address1} onChange={(event) => updateField("address1", event.target.value)} autoComplete="address-line1" placeholder="Street and house number" required maxLength={240} /></label>
        <label className="account-field-wide">Address line 2 <span className="account-optional-label">Optional</span><input value={form.address2} onChange={(event) => updateField("address2", event.target.value)} autoComplete="address-line2" placeholder="Apartment, suite, unit" maxLength={240} /></label>
        <label>City<input value={form.city} onChange={(event) => updateField("city", event.target.value)} autoComplete="address-level2" required maxLength={120} /></label>
        <label>State / prefecture<input value={form.region} onChange={(event) => updateField("region", event.target.value)} autoComplete="address-level1" maxLength={120} /></label>
        <label>Postal code<input value={form.postalCode} onChange={(event) => updateField("postalCode", event.target.value)} autoComplete="postal-code" required maxLength={40} /></label>
        <label>Country code<input value={form.countryCode} onChange={(event) => updateField("countryCode", event.target.value.slice(0, 2))} autoComplete="country" placeholder="JP" required minLength={2} maxLength={2} /></label>
        <label className="account-field-wide">Phone <span className="account-optional-label">Optional</span><input type="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} autoComplete="tel" maxLength={40} /></label>
        <label className="account-default-check"><input type="checkbox" checked={form.isDefault} onChange={(event) => updateField("isDefault", event.target.checked)} /><span>Make this my default delivery address</span><span aria-hidden="true">✦</span></label>
        <div className="account-form-actions account-field-wide"><button className="account-primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Save address"}<span aria-hidden="true">♡</span></button><button className="account-quiet-button" type="button" onClick={() => setFormOpen(false)}>Cancel</button></div>
      </form>
    </section>}

    {addresses.length ? <div className="account-address-grid" aria-label="Saved delivery addresses">
      {addresses.map((address) => <article className={`account-address-card${address.isDefault ? " is-default" : ""}`} key={address.id}>
        <div className="account-address-card-top"><span className="account-address-icon" aria-hidden="true">⌖</span>{address.isDefault ? <span className="account-default-badge"><span aria-hidden="true">✦</span> DEFAULT</span> : <button className="account-make-default" type="button" disabled={busyAddressId === address.id} onClick={() => void makeDefault(address)}>Make default</button>}</div>
        <h2>{address.firstName} {address.lastName}</h2>
        <address>{address.address1}{address.address2 && <>,<br />{address.address2}</>}<br />{address.city}{address.region ? `, ${address.region}` : ""} {address.postalCode}<br />{address.countryCode}</address>
        {address.phone && <p className="account-address-phone">{address.phone}</p>}
        <div className="account-address-actions"><button type="button" onClick={() => beginEdit(address)}>Edit</button><button type="button" disabled={busyAddressId === address.id} onClick={() => void deleteAddress(address)}>{busyAddressId === address.id ? "Please wait…" : "Remove"}</button></div>
      </article>)}
    </div> : !formOpen && <div className="account-address-empty"><span aria-hidden="true">🪼</span><h2>No saved addresses yet</h2><p>Add a delivery address and we’ll keep it safe for your next little parcel.</p><button className="account-primary-button" type="button" onClick={beginAdd}>Add your first address <span aria-hidden="true">＋</span></button></div>}

    <footer className="account-hub-footer"><p><span aria-hidden="true">🔒</span> Your delivery details are private and saved to your Ponyo account.</p><Link className="account-quiet-link" href="/account">Back to my profile <span aria-hidden="true">→</span></Link></footer>
  </section>;
}
