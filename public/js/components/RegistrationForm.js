class RegistrationForm extends HTMLElement {
    constructor() {
        super();

        this.attachShadow({ mode: 'open' });

        const gameTCs = this.getAttribute('game_tcs');
        this.template = document.createElement('template');
        this.template.innerHTML = `
            <form name="game_settings" id="game_settings">
                <div class="mb-3">
                    <label for="registration_name">Your Name:</label>
                    <input type="text" id="registration_name" name="registration_name">
                </div>

                <div class="mb-3">
                    <label for="registration_number">Your Mobile Number:</label>
                    <input type="text" id="registration_number" name="registration_number">
                </div>

                <div class="mb-3"></div>
                    <input type="checkbox" name="player_agreement" required id="player_agreement"/>
                    <label for="player_agreement">I agree to the terms and conditions of this game <a id="game_tcs_href" href="${gameTCs}"target="_blank">Here</a></label>
                </div>

                <div class="row p-3">
                    <div class="col-sm-12 d-grid">
                    <button id="submit-registration" class="submit-registration btn btn-info" disabled>Submit Your Information</button>
                    </div>
                </div>            
            </form>
        `;
    }

    connectedCallback() {
        this.shadowRoot.appendChild(this.template.content.cloneNode(true));
        const form = this.shadowRoot.getElementById('game_settings')
        const submitButton = this.shadowRoot.getElementById('submit-registration');
        const checkbox = this.shadowRoot.getElementById('player_agreement');
        checkbox.addEventListener('change', (e) => {
            console.log(e.target.checked)
            if (e.target.checked) {
                submitButton.disabled = false;
            } else {
                submitButton.disabled = true;
            }
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const urlParams = new URLSearchParams(window.location.search);
            const gameId = urlParams.get('register');

            const formData = new FormData(form);
            const newPlayer = {
                name: formData.get('registration_name'),
                number: formData.get('registration_number'),
                agreement: formData.get('player_agreement') === 'on' ? true : false,
                game: gameId,
            }

            const headers = new Headers();
            headers.append('Content-Type', 'application/json');
            return fetch(
                `${apiHost}/players`,
                {
                    method: 'POST',
                    body: JSON.stringify(newPlayer),
                    headers: headers,
                },
                )
                    .then((res) => res.json())
                    .then((game) => {
                        clearRegistrationForm();
                        thanksForRegistering();       
                    });
        })
    }
}

customElements.define('registration-form', RegistrationForm);