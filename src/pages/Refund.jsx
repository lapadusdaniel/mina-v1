import LegalPage from './LegalPage'

export default function Refund() {
  return (
    <LegalPage title="Politică de Rambursare" updatedAt="Martie 2026">
      <section>
        <h2>1. Principii generale</h2>
        <p>
          Mina oferă un plan gratuit permanent care permite testarea platformei înainte de achiziționarea unui abonament plătit. Din această cauză, politica de rambursare este limitată.
        </p>
      </section>

      <section>
        <h2>2. Rambursări eligibile</h2>
        <p>
          Aveți dreptul la rambursare completă în următoarele situații: solicitare în primele 7 zile de la prima plată a unui abonament nou (nu la reînnoire), eroare tehnică dovedită din partea Mina care a împiedicat utilizarea serviciului pentru mai mult de 48 de ore consecutive, taxare dublă sau incorectă din cauza unei erori de sistem.
        </p>
      </section>

      <section>
        <h2>3. Rambursări neeligibile</h2>
        <p>
          Nu sunt eligibile pentru rambursare: plățile de reînnoire lunară, perioadele deja utilizate parțial, solicitările după 7 zile de la plată, situațiile în care contul a fost suspendat pentru încălcarea Termenilor și Condițiilor.
        </p>
      </section>

      <section>
        <h2>4. Procedura de solicitare</h2>
        <p>
          Contactați-ne la hello@cloudbymina.com cu subiectul "Solicitare rambursare" și includeți: adresa de email asociată contului, data plății, motivul solicitării. Vom procesa solicitarea în maximum 5 zile lucrătoare. Rambursarea se efectuează pe același instrument de plată utilizat la cumpărare, în 5-10 zile lucrătoare.
        </p>
      </section>

      <section>
        <h2>5. Dreptul de retragere</h2>
        <p>
          Conform legislației UE privind drepturile consumatorilor (OUG 34/2014), aveți dreptul de retragere în 14 zile de la încheierea contractului, cu excepția cazului în care ați solicitat expres furnizarea serviciului înainte de expirarea acestei perioade și serviciul a fost furnizat integral.
        </p>
      </section>

      <section>
        <h2>6. Anularea abonamentului</h2>
        <p>
          Puteți anula abonamentul oricând din dashboard-ul Mina. Anularea intră în vigoare la sfârșitul perioadei plătite curente. Nu se emit rambursări pentru perioada rămasă din luna în curs.
        </p>
      </section>
    </LegalPage>
  )
}
