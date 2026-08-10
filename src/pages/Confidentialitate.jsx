import LegalPage from './LegalPage'
import { openCookieSettings } from '../services/analytics'

export default function Confidentialitate() {
  return (
    <LegalPage title="Politică de Confidențialitate" updatedAt="10 august 2026">
      <section>
        <h2>1. Operator de date</h2>
        <p>
          Operatorul de date personale este: Lapadus Daniel Ionut, România, hello@cloudbymina.com.
        </p>
      </section>

      <section>
        <h2>2. Date colectate</h2>
        <p>
          <strong>2.1. Date furnizate de dumneavoastră:</strong> nume și adresă de email (la înregistrare), date de facturare (procesate prin Stripe — nu stocate direct de Mina), fotografii și conținut încărcat pe platformă, mesaje trimise prin formularul de contact.
        </p>
        <p>
          <strong>2.2. Date tehnice și de utilizare:</strong> furnizorii de infrastructură pot prelucra adresa IP, informații despre browser și dispozitiv și loguri tehnice necesare securității și funcționării serviciului. Mina prelucrează date operaționale precum numărul de galerii și spațiul de stocare utilizat. Cu acordul dumneavoastră, Google Analytics colectează statistici despre paginile și funcțiile utilizate, tipul dispozitivului și sursa generală a vizitei. Nu trimitem către Analytics nume, adrese de email, fotografii, denumiri de galerii, parole sau linkuri private.
        </p>
      </section>

      <section>
        <h2>3. Scopul prelucrării datelor</h2>
        <p>
          Furnizarea și îmbunătățirea serviciilor Mina, procesarea plăților și gestionarea abonamentelor, comunicări despre cont (emailuri tranzacționale), respectarea obligațiilor legale, prevenirea fraudei și asigurarea securității.
        </p>
      </section>

      <section>
        <h2>4. Temeiul juridic al prelucrării</h2>
        <p>
          Executarea contractului (furnizarea serviciilor pentru care v-ați înregistrat), consimțământul dumneavoastră (pentru Google Analytics și comunicări de marketing, dacă este cazul), obligație legală (facturare, contabilitate), interesul legitim (securitatea platformei, prevenirea fraudei). Refuzul Analytics nu afectează funcționarea platformei.
        </p>
      </section>

      <section>
        <h2>5. Destinatari și transferuri de date</h2>
        <p>
          Datele dumneavoastră pot fi prelucrate de: Stripe — procesarea plăților; Google Firebase — autentificare, funcții backend și bază de date; Google Analytics — statistici de utilizare numai după consimțământ; Backblaze B2 — stocarea fișierelor și fotografiilor; Cloudflare — livrarea securizată a fișierelor, protecție și infrastructură edge; Resend — trimiterea emailurilor tranzacționale. Acești furnizori pot prelucra date în Spațiul Economic European și în alte jurisdicții, pe baza mecanismelor legale aplicabile. Nu vindem și nu închiriem datele dumneavoastră în scop publicitar.
        </p>
      </section>

      <section>
        <h2>6. Durata stocării</h2>
        <p>
          Datele contului și fotografiile sunt păstrate cât timp contul sau galeria sunt active și apoi pentru perioada necesară ștergerii, soluționării solicitărilor și respectării obligațiilor legale. Galeriile trimise în coș sunt programate pentru ștergere după 30 de zile. Documentele financiar-contabile se păstrează conform termenelor impuse de lege. Unele copii tehnice sau loguri pot rămâne temporar în sistemele furnizorilor, potrivit politicilor lor de retenție și backup.
        </p>
      </section>

      <section>
        <h2>7. Drepturile dumneavoastră (GDPR)</h2>
        <p>
          Dreptul de acces, dreptul de rectificare, dreptul de ștergere, dreptul de portabilitate, dreptul de opoziție, dreptul la restricționarea prelucrării. Pentru exercitarea acestor drepturi, contactați-ne la hello@cloudbymina.com. Vom răspunde în maximum 30 de zile. Aveți dreptul să depuneți o plângere la ANSPDCP, www.dataprotection.ro.
        </p>
      </section>

      <section>
        <h2>8. Cookie-uri</h2>
        <p>
          Mina utilizează cookie-uri și stocare locală esențiale pentru autentificare, sesiune, securitate și preferințe. Google Analytics este încărcat numai dacă apăsați „Accept Analytics”. Puteți refuza fără pierderea funcționalităților și vă puteți retrage acordul oricând din „Preferințe cookie”. În prezent nu folosim cookie-uri pentru publicitate comportamentală sau remarketing.
        </p>
        <p>
          <button type="button" className="legal-inline-button" onClick={openCookieSettings}>Deschide preferințele cookie</button>
        </p>
      </section>

      <section>
        <h2>9. Securitatea datelor</h2>
        <p>
          Implementăm măsuri tehnice și organizatorice adecvate pentru protejarea datelor, inclusiv: criptare în tranzit (HTTPS), autentificare securizată, acces restricționat la date.
        </p>
      </section>

      <section>
        <h2>10. Modificări</h2>
        <p>
          Această politică poate fi actualizată. Modificările semnificative vor fi comunicate prin email. Data ultimei actualizări este indicată la începutul documentului.
        </p>
      </section>
    </LegalPage>
  )
}
