import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";
import "./webshop.css";

const lids = [
  { code: 2, label: "Grün", color: "#a9c849" },
  { code: 1, label: "Rot", color: "#bf3f35" },
  { code: 4, label: "Blau", color: "#2864ad" },
];
const balls = [
  { field: "uiKugelRot", label: "Rote Kugeln", color: "#be4034" },
  { field: "uiKugelGruen", label: "Grüne Kugeln", color: "#4a791e" },
  { field: "uiKugelBlau", label: "Blaue Kugeln", color: "#2162b1" },
];
const initialBox = { bDeckelfarbe: 2, uiKugelRot: 3, uiKugelGruen: 2, uiKugelBlau: 3 };
const productImage = "/webshop-kugelbox.jpg";

export default function WebshopPage() {
  const [box, setBox] = useState(initialBox);
  const [cart, setCart] = useState(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  function addToCart() {
    setCart(box);
    setResult(null);
  }

  async function checkout() {
    if (!cart || sending) return;
    setSending(true);
    setResult(null);
    try {
      await api.post("/shopfloor/webshop/orders", cart);
      setCart(null);
      setResult({ message: "Bestellung an den MQTT-Broker gesendet." });
    } catch (error) {
      setResult({ error: true, message: `Bestellung konnte nicht gesendet werden. ${error.message}` });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="webshop" lang="de">
      <div className="webshop-shell">
        <header className="webshop-header">
          <span><strong>WARA</strong> / BOX</span>
          <Link to="/">Zurück zum MES</Link>
        </header>
        <main>
          <div className="webshop-hero">
            <img src={productImage} alt="Durchsichtige Kugelbox mit grünem Deckel und bunten Kugeln" width="715" height="429" />
            <div>
              <h1>Deine <br />Kugelbox.</h1>
              <p>Wähle die Deckelfarbe und die Anzahl roter, grüner und blauer Kugeln.</p>
            </div>
          </div>
          <div className="webshop-panels">
            <section className="webshop-config" aria-labelledby="webshop-config-title">
              <h2 id="webshop-config-title">Box zusammenstellen</h2>
              <div className="webshop-lids" role="group" aria-label="Deckelfarbe">
                <span>Deckelfarbe</span>
                {lids.map(({ code, label, color }) => (
                  <button key={code} type="button" className="webshop-swatch" style={{ backgroundColor: color }}
                    aria-label={label} title={label} aria-pressed={box.bDeckelfarbe === code}
                    onClick={() => setBox((current) => ({ ...current, bDeckelfarbe: code }))} />
                ))}
              </div>
              {balls.map(({ field, label, color }) => (
                <div key={field} className="webshop-ball-row">
                  <span><i style={{ backgroundColor: color }} />{label}</span>
                  <div className="webshop-stepper">
                    <button type="button" aria-label={`${label}: eine weniger`} disabled={box[field] === 0}
                      onClick={() => setBox((current) => ({ ...current, [field]: current[field] - 1 }))}>−</button>
                    <output aria-label={label}>{box[field]}</output>
                    <button type="button" aria-label={`${label}: eine mehr`} disabled={box[field] === 99}
                      onClick={() => setBox((current) => ({ ...current, [field]: current[field] + 1 }))}>+</button>
                  </div>
                </div>
              ))}
              <button className="webshop-action" type="button" onClick={addToCart} disabled={sending}>
                {cart ? "Box im Warenkorb ersetzen" : "In den Warenkorb"}
              </button>
            </section>
            <section className="webshop-cart" aria-labelledby="webshop-cart-title">
              <h2 id="webshop-cart-title">Warenkorb</h2>
              <div className="webshop-cart-content">
                {cart ? (
                  <div className="webshop-cart-item">
                    <img src={productImage} alt="" width="96" height="80" />
                    <div>
                      <strong>1 × Kugelbox</strong>
                      <p>Deckel {lids.find(({ code }) => code === cart.bDeckelfarbe).label} · Rot {cart.uiKugelRot} · Grün {cart.uiKugelGruen} · Blau {cart.uiKugelBlau}</p>
                      <button className="webshop-remove" type="button" disabled={sending}
                        onClick={() => { setCart(null); setResult(null); }}>Entfernen</button>
                    </div>
                  </div>
                ) : <p>Dein Warenkorb ist leer.</p>}
              </div>
              {result && <p className="webshop-result" role={result.error ? "alert" : "status"}>{result.message}</p>}
              <button className="webshop-action" type="button" disabled={!cart || sending} onClick={checkout}>
                {sending ? "Wird gesendet …" : "Bestellung senden"}
              </button>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
