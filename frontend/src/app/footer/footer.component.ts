import { Component } from '@angular/core';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css'
})
export class FooterComponent {
  currentYear = new Date().getFullYear();

  showPrivacyPolicy(event: Event) {
    event.preventDefault();
    alert(`PRIVACY POLICY

Ultimo aggiornamento: ${new Date().toLocaleDateString('it-IT')}

1. DATI RACCOLTI
Belotta.net non raccoglie dati personali degli utenti. Il nome inserito viene utilizzato solo per identificare i giocatori durante la partita e non viene salvato permanentemente.

2. COOKIE E STORAGE LOCALE
Il sito utilizza localStorage del browser solo per salvare temporaneamente le sessioni di gioco attive, permettendo la riconnessione automatica in caso di disconnessione.

3. DATI DI GIOCO
Le partite sono temporanee e tutti i dati di gioco vengono eliminati alla chiusura della sessione. Non vengono conservate statistiche o cronologie.

4. TERZE PARTI
Il sito non condivide dati con terze parti. Non utilizziamo sistemi di tracciamento o analytics.

5. SICUREZZA
La comunicazione avviene tramite protocollo sicuro. Il gioco è completamente gratuito e non richiede registrazione.

6. DIRITTI DELL'UTENTE
Puoi cancellare i dati locali in qualsiasi momento pulendo la cache del browser.

Per domande: info@belotta.net`);
  }

  showTerms(event: Event) {
    event.preventDefault();
    alert(`TERMINI DI SERVIZIO

Ultimo aggiornamento: ${new Date().toLocaleDateString('it-IT')}

1. ACCETTAZIONE DEI TERMINI
Utilizzando Belotta.net, accetti questi termini di servizio.

2. DESCRIZIONE DEL SERVIZIO
Belotta.net è un gioco di carte gratuito che riproduce le regole della Belotte Bridgè come si gioca tradizionalmente a San Lorenzo al Mare (IM). Il gioco è probabilmente la variante nota come Belote Contrée. Il servizio è fornito "così com'è" senza garanzie.

3. USO DEL SERVIZIO
- Il gioco è gratuito e destinato esclusivamente all'intrattenimento
- Non è richiesta registrazione
- È vietato l'uso di bot o software di automazione
- È vietato qualsiasi comportamento offensivo o inappropriato

4. PROPRIETÀ INTELLETTUALE
Il codice e i contenuti del sito sono di proprietà di Belotta.net. Le regole della Belotte Bridgè/Belote Contrée sono di dominio pubblico e parte della tradizione ligure.

5. LIMITAZIONE DI RESPONSABILITÀ
Il servizio è fornito gratuitamente. Non siamo responsabili per interruzioni del servizio, perdita di dati o altri danni.

6. MODIFICHE
Ci riserviamo il diritto di modificare questi termini in qualsiasi momento.

7. NESSUNA TRANSAZIONE MONETARIA
Questo è un gioco completamente gratuito. Non vengono effettuate transazioni di denaro reale.

8. LEGGE APPLICABILE
Questi termini sono regolati dalla legge italiana.

Per domande: info@belotta.net`);
  }
}
