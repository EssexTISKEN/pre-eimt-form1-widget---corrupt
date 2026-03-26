à(async () => {

  /* ------------------------------------------------------
     1. INITIALISATION & UTILITAIRES
  ------------------------------------------------------ */

  await ZOHO.CRM.UI.Widget.init();

  const $ = (id) => document.getElementById(id);
  const show = (el, flag) => el.classList.toggle("hide", !flag);

  const dec2 = (n) => {
    const v = parseFloat(n);
    return isNaN(v) ? 0 : parseFloat(v.toFixed(2));
  };

  const uploadFileToCRM = async (file) => {
    const form = new FormData();
    form.append("file", file, file.name);

    try {
      const resp = await ZOHO.CRM.API.uploadFile({ formData: form });
      const id = resp?.data?.[0]?.details?.file_id;
      return id || null;
    } catch (e) {
      console.error("Erreur upload :", e);
      return null;
    }
  };

  /* ------------------------------------------------------
     2. CAPTURE DES ÉLÉMENTS DU DOM
  ------------------------------------------------------ */

  const EIMT_anterieure = $("EIMT_anterieure");
  const grpEimtPdf = $("grp_eimt_pdf");

  const descExiste = $("Description_poste_existe");
  const grpDescPdf = $("grp_desc_pdf");

  const tous = $("Tous_meme_salaire");
  const grpUni = $("grp_salaire_unique");
  const grpList = $("grp_liste_tet");

  const hs = $("Heures_sup");
  const grpHS = $("grp_taux_hs");

  const nb = $("Nb_TET_vises");
  const body = $("tbl_body");

  /* ------------------------------------------------------
     3. COMPORTEMENTS DYNAMIQUES DU FORMULAIRE
  ------------------------------------------------------ */

  EIMT_anterieure.onchange = () => show(grpEimtPdf, EIMT_anterieure.value === "Oui");
  descExiste.onchange = () => show(grpDescPdf, descExiste.value === "Oui");
  hs.onchange = () => show(grpHS, hs.value === "Oui");

  tous.onchange = () => {
    const unique = tous.value === "Oui";
    show(grpUni, unique);
    show(grpList, !unique);
    if (!unique) rebuildRows();
  };

  nb.oninput = () => {
    if (tous.value === "Non") rebuildRows();
  };

  function rebuildRows(prefill = []) {
    const n = Math.max(0, parseInt(nb.value || "0", 10));
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
        if (prefill[i].salaire != null) {
          r.querySelector(".r_sal").value = prefill[i].salaire;
        }
      }

      body.appendChild(r);
    }
  }

  /* ------------------------------------------------------
     4. CONTEXTE : RÉCUPÉRATION AUTO DU MATTER
  ------------------------------------------------------ */

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

  /* ------------------------------------------------------
     5. SI MATTER TROUVÉ → PRÉREMPLISSAGE
  ------------------------------------------------------ */

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

        const info = Array.isArray(m.Info_TET) ? m.Info_TET : [];
        const pre = [];

        for (const line of info) {
          let prenom = line.TET_Prenom || "";
          let nom = line.TET_Nom || "";
          let salaire = line.Salaire_horaire != null ? line.Salaire_horaire : null;

          if (line.Candidat?.id) {
            try {
              const c = await ZOHO.CRM.API.getRecord({
                Entity: "Contacts",
                RecordID: line.Candidat.id
              });
              const co = c?.data?.[0] || {};
              if (co.First_Name) prenom = co.First_Name;
              if (co.Last_Name) nom = co.Last_Name;
            } catch (e) {}
          }

          pre.push({ prenom, nom, salaire });
        }

        if (pre.length) {
          tous.value = "Non";
          show(grpUni, false);
          show(grpList, true);

          nb.value = pre.length;
          rebuildRows(pre);
        }
      }
    } catch (e) {
      console.error("Erreur préremplissage:", e);
    }
  }

  /* ------------------------------------------------------
     6. SOUMISSION DU FORMULAIRE
  ------------------------------------------------------ */

  $("btn_submit").onclick = async () => {
    $("msg").textContent = "Traitement...";

    const payload = {
      Matter: matterId || "",
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

    /* SALAIRE UNIQUE OU MULTIPLE */

    if (tous.value === "Non") {
      const rows = [];
      document.querySelectorAll("#tbl_body tr").forEach(tr => {
        rows.push({
          TET_Prenom: tr.querySelector(".r_prenom").value.trim(),
          TET_Nom: tr.querySelector(".r_nom").value.trim(),
          TET_Salaire: dec2(tr.querySelector(".r_sal").value)
        });
      });
      payload["Liste_TET"] = rows;
    } else if (tous.value === "Oui") {
      payload["Salaire_horaire_unique"] = dec2($("Salaire_horaire_unique").value);
    }

    /* FICHIERS */

    if (EIMT_anterieure.value === "Oui") {
      const f = $("EIMT_anterieure_pdf").files[0];
      if (f) {
        const id = await uploadFileToCRM(f);
        if (id) payload["EIMT_anterieure_pdf_id"] = id;
      }
    }

    if (descExiste.value === "Oui") {
      const f = $("Description_poste_pdf").files[0];
      if (f) {
        const id = await uploadFileToCRM(f);
        if (id) payload["Description_poste_pdf_id"] = id;
      }
    }

    const extraFiles = $("Documents_supplementaires").files;
    if (extraFiles.length) {
      const ids = [];
      for (const f of extraFiles) {
        const id = await uploadFileToCRM(f);
        if (id) ids.push(id);
      }
      payload["Documents_supplementaires_ids"] = ids;
    }

    /* INSERTION CRM */

    try {
      const ins = await ZOHO.CRM.API.insertRecord({
        Entity: "PRE_EIMT_Formulaire_1",
        APIData: [payload]
      });

      const res = ins?.data?.[0];
      if (res?.code === "SUCCESS") {
        $("msg").textContent = "Formulaire soumis avec succès.";
        alert("Soumis !");
      } else {
        console.error(ins);
        $("msg").textContent = "Erreur lors de la création.";
        alert("Erreur, voir console.");
      }
    } catch (e) {
      console.error("Erreur inattendue:", e);
      $("msg").textContent = "Erreur inattendue.";
      alert("Erreur inattendue.");
    }
  };

})();
