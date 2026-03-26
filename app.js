(async () => {

  await ZOHO.CRM.UI.Widget.init();

  const $ = (id) => document.getElementById(id);

  /* ============================================================
     FONCTION UTILE POUR AFFICHER / CACHER
  ============================================================ */
  const show = (id, flag) => {
    const el = $(id);
    if (!el) return;
    if (flag) el.classList.remove("hidden");
    else el.classList.add("hidden");
  };

  const dec2 = (n) => {
    const v = parseFloat(n);
    return isNaN(v) ? 0 : parseFloat(v.toFixed(2));
  };

  /* ============================================================
     GESTION DES CHAMPS CONDITIONNELS
  ============================================================ */

  // 1. EIMT antérieure ?
  $("EIMT_anterieure").onchange = () => {
    show("grp_eimt_pdf", $("EIMT_anterieure").value === "Oui");
  };

  // 2. Description du poste ?
  $("Description_poste_existe").onchange = () => {
    show("grp_desc_pdf", $("Description_poste_existe").value === "Oui");
  };

  // 3. Tous même salaire ?
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

  // 4. Heures supplémentaires ?
  $("Heures_sup").onchange = () => {
    show("grp_taux_hs", $("Heures_sup").value === "Oui");
  };

  // Table dynamique des TET
  $("Nb_TET_vises").oninput = () => {
    if ($("Tous_meme_salaire").value === "Non") rebuildRows();
  };

  const body = $("tbl_body");
  function rebuildRows(prefill = []) {
    const n = Math.max(0, parseInt($("Nb_TET_vises").value || "0", 10));
    body.innerHTML = "";

    for (let i = 0; i < n; i++) {
      const r = document.createElement("tr");
      r.innerHTML = `
        <td><input class="r_prenom"></td>
        <td><input class="r_nom"></td>
        <td><input class="r_sal" type="number" min="0" step="0.01"></td>
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
     CONTEXTE MATTER
  ============================================================ */
  let matterId = null;

  try {
    const w = await ZOHO.CRM.UI.Widget.get();
    matterId = w?.EntityId || null;
  } catch (e) {}

  if (!matterId) {
    try {
      const ctx = await ZOHO.CRM.UI.Record.get({ Entity: "Matters" });
      matterId = ctx?.data?.Id || null;
    } catch (e) {}
  }

  // Préremplissage si disponible
  if (matterId) {
    try {
      const resp = await ZOHO.CRM.API.getRecord({
        Entity: "Matters",
        RecordID: matterId
      });

      const m = resp?.data?.[0];
      if (m) {
        if (m.C_P_lieu_de_travail && !$("CodePostal_LieuTravail").value) {
          $("CodePostal_LieuTravail").value = m.C_P_lieu_de_travail;
        }

        // Préremplissage TET
        const info = Array.isArray(m.Info_TET) ? m.Info_TET : [];
        const pre = [];

        for (const line of info) {
          let prenom = line.TET_Prenom || "";
          let nom = line.TET_Nom || "";
          let salaire = line.Salaire_horaire || null;
          pre.push({ prenom, nom, salaire });
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
     SOUMISSION
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
      Questionnaire_statut: "Soumis"
    };

    // Salaire unique ou liste
    if ($("Tous_meme_salaire").value === "Oui") {
      payload.Salaire_horaire_unique = dec2($("Salaire_horaire_unique").value);
    } else if ($("Tous_meme_salaire").value === "Non") {
      const rows = [];
      document.querySelectorAll("#tbl_body tr").forEach(tr => {
        rows.push({
          TET_Prenom: tr.querySelector(".r_prenom").value.trim(),
          TET_Nom: tr.querySelector(".r_nom").value.trim(),
          TET_Salaire: dec2(tr.querySelector(".r_sal").value)
        });
      });
      payload.Liste_TET = rows;
    }

    // INSERT
    try {
      const ins = await ZOHO.CRM.API.insertRecord({
        Entity: "PRE_EIMT_Formulaire_1",
        APIData: [payload]
      });

      if (ins?.data?.[0]?.code === "SUCCESS") {
        $("msg").textContent = "Soumis avec succès!";
        alert("Soumis.");
      } else {
        $("msg").textContent = "Erreur de création.";
        console.error(ins);
      }

    } catch (e) {
      console.error(e);
      $("msg").textContent = "Erreur inattendue.";
    }
  };

})();
