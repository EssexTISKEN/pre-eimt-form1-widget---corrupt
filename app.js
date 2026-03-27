ZOHO.embeddedApp.on("PageLoad", async function (data) {

    /* ============================================================
       Utils
    ============================================================ */
    const $ = (id) => document.getElementById(id);

    const show = (id, flag) => {
        const el = $(id);
        if (!el) return;
        el.classList.toggle("hidden", !flag);
    };

    const dec2 = (n) => {
        const v = parseFloat(n);
        return isNaN(v) ? 0 : parseFloat(v.toFixed(2));
    };

    /* ============================================================
       DRAG & DROP INITIALISATION
    ============================================================ */
    function initDropzones() {
        document.querySelectorAll(".dropzone").forEach(zone => {

            const input = zone.querySelector("input[type='file']");
            const list = zone.querySelector(".file-list");

            // Cliquer sur la zone → ouvre le file picker
            zone.addEventListener("click", () => input.click());

            // Drag over → style visuel
            zone.addEventListener("dragover", (e) => {
                e.preventDefault();
                zone.classList.add("dragover");
            });

            zone.addEventListener("dragleave", () => {
                zone.classList.remove("dragover");
            });

            // Drop
            zone.addEventListener("drop", (e) => {
                e.preventDefault();
                zone.classList.remove("dragover");

                const dt = new DataTransfer();
                for (const f of e.dataTransfer.files) dt.items.add(f);
                input.files = dt.files;

                updateList();
            });

            // Sélection par file picker
            input.addEventListener("change", updateList);

            function updateList() {
                list.innerHTML = "";
                if (!input.files) return;

                [...input.files].forEach(file => {
                    const div = document.createElement("div");
                    div.textContent = file.name;
                    list.appendChild(div);
                });
            }
        });
    }

    initDropzones();


    /* ============================================================
       Conditionnels
    ============================================================ */

    // 1–2 EIMT
    $("EIMT_anterieure").onchange = () =>
        show("grp_eimt_pdf", $("EIMT_anterieure").value === "Oui");

    // 4–5 Description du poste
    $("Description_poste_existe").onchange = () =>
        show("grp_desc_pdf", $("Description_poste_existe").value === "Oui");

    // 11–12/13 Salaire unique ou liste TET
    $("Tous_meme_salaire").onchange = () => {
        const val = $("Tous_meme_salaire").value;
        if (val === "Oui") {
            show("grp_salaire_unique", true);
            show("grp_liste_tet", false);
        } else if (val === "Non") {
            show("grp_salaire_unique", false);
            show("grp_liste_tet", true);
            rebuildRows();
        } else {
            show("grp_salaire_unique", false);
            show("grp_liste_tet", false);
        }
    };

    // 14–15 Heures sup
    $("Heures_sup").onchange = () =>
        show("grp_taux_hs", $("Heures_sup").value === "Oui");

    // 19–20 Régime de retraite
    $("Regime_retraite").onchange = () =>
        show("grp_regime_retraite", $("Regime_retraite").value === "Oui");

    // 27–28 Travail partagé
    $("Travail_partage").onchange = () =>
        show("grp_travail_partage", $("Travail_partage").value === "Oui");

    // Dynamique : nombre de TET
    $("Nb_TET_vises").oninput = () => {
        if ($("Tous_meme_salaire").value === "Non") rebuildRows();
    };


    /* ============================================================
       Tableau TET
    ============================================================ */
    const body = $("tbl_body");

    function rebuildRows(prefill = []) {
        const n = Math.max(0, parseInt($("Nb_TET_vises").value || "0", 10));
        body.innerHTML = "";

        for (let i = 0; i < n; i++) {
            const r = document.createElement("tr");

            r.innerHTML = `
                <td><input class="r_prenom"></td>
                <td><input class="r_nom"></td>
                <td><input class="r_sal" type="number" step="0.01"></td>
            `;

            if (prefill[i]) {
                r.querySelector(".r_prenom").value = prefill[i].prenom || "";
                r.querySelector(".r_nom").value = prefill[i].nom || "";
                r.querySelector(".r_sal").value = prefill[i].salaire || "";
            }

            body.appendChild(r);
        }
    }


    /* ============================================================
       Contexte MATTER
    ============================================================ */
    let matterId = data?.EntityId || null;

    if (!matterId) {
        try {
            const ctx = await ZOHO.CRM.UI.Record.get({ Entity: "Matters" });
            matterId = ctx?.data?.Id || null;
        } catch (e) {}
    }


    /* ============================================================
       Préremplissage
    ============================================================ */
    if (matterId) {
        try {
            const resp = await ZOHO.CRM.API.getRecord({
                Entity: "Matters",
                RecordID: matterId,
            });

            const m = resp?.data?.[0];

            if (m) {
                if (m.C_P_lieu_de_travail && !$("CodePostal_LieuTravail").value) {
                    $("CodePostal_LieuTravail").value = m.C_P_lieu_de_travail;
                }

                const info = Array.isArray(m.Info_TET) ? m.Info_TET : [];
                const pre = [];

                for (const t of info) {
                    pre.push({
                        prenom: t.TET_Prenom || "",
                        nom: t.TET_Nom || "",
                        salaire: t.Salaire_horaire || "",
                    });
                }

                if (pre.length) {
                    $("Tous_meme_salaire").value = "Non";
                    show("grp_salaire_unique", false);
                    show("grp_liste_tet", true);
                    $("Nb_TET_vises").value = pre.length;
                    rebuildRows(pre);
                }
            }
        } catch (e) {}
    }


    /* ============================================================
       Soumission
    ============================================================ */
    $("btn_submit").onclick = async () => {

        $("msg").textContent = "Traitement...";

        const payload = {
            Matter: matterId,
            Titre_poste: $("Titre_poste").value || "",
            Nb_TET_vises: parseInt($("Nb_TET_vises").value || "0", 10),
            Renouvellement: $("Renouvellement").value,
            Adresse_LieuTravail: $("Adresse_LieuTravail").value || "",
            Ville_LieuTravail: $("Ville_LieuTravail").value || "",
            CodePostal_LieuTravail: $("CodePostal_LieuTravail").value || "",
            Tous_meme_salaire: $("Tous_meme_salaire").value,
            Heures_sup: $("Heures_sup").value,
            Vacances_jours: parseInt($("Vacances_jours").value || "0", 10),
            Informations_complementaires: $("Informations_complementaires").value || "",
            Questionnaire_statut: "Soumis",
        };

        if ($("Tous_meme_salaire").value === "Oui") {
            payload.Salaire_horaire_unique = dec2($("Salaire_horaire_unique").value);
        } else if ($("Tous_meme_salaire").value === "Non") {
            const rows = [];
            document.querySelectorAll("#tbl_body tr").forEach((tr) => {
                rows.push({
                    TET_Prenom: tr.querySelector(".r_prenom").value.trim(),
                    TET_Nom: tr.querySelector(".r_nom").value.trim(),
                    TET_Salaire: dec2(tr.querySelector(".r_sal").value),
                });
            });
            payload.Liste_TET = rows;
        }

        try {
            const ins = await ZOHO.CRM.API.insertRecord({
                Entity: "PRE_EIMT_Formulaire_1",
                APIData: [payload],
            });

            if (ins?.data?.[0]?.code === "SUCCESS") {
                $("msg").textContent = "Soumis avec succès!";
                alert("Soumis.");
            } else {
                $("msg").textContent = "Erreur lors de la création.";
                console.error(ins);
            }

        } catch (e) {
            $("msg").textContent = "Erreur inattendue.";
            console.error(e);
        }
    };
});


/* Obligatoire */
ZOHO.embeddedApp.init();
