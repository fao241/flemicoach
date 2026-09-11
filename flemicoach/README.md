# FlemiCoach

Web app légère de gestion de présence pour éducateurs de football.

## Fonctions incluses

- comptes éducateurs avec Supabase Auth ;
- plusieurs équipes par éducateur ;
- planning récurrent des entraînements ;
- ajout manuel des matchs / événements ;
- import joueurs et calendrier depuis CSV, XLS/XLSX et PDF texte ;
- lien public par séance/match à partager dans WhatsApp ;
- réponse parent sans compte : Présent / Absent + commentaire ;
- validation de la présence réelle par l'éducateur ;
- statistiques par joueur : présence réelle, taux de réponse, fiabilité de la réponse, non-réponses et no-shows ;
- statistiques d'équipe ;
- rappels éducateur par email via Supabase Edge Function + Resend ;
- Row Level Security (RLS) et aucun accès anonyme direct aux tables ;
- hébergement frontend compatible GitHub Pages.

## Architecture

```text
GitHub Pages
  └─ index.html / app.js / styles.css
        └─ Supabase JS (clé publishable uniquement)
              ├─ Auth
              ├─ PostgreSQL + RLS
              ├─ RPC publique limitée pour les réponses parents
              └─ Edge Function send-reminders
                    └─ Resend (email)
```

La clé Supabase **publishable** est publique par conception. Ne place jamais de `service_role`, de secret key Supabase ou de clé Resend dans `config.js`.

---

# Mise en production

## 1. Créer le projet Supabase

Crée un projet sur Supabase.

Dans **SQL Editor**, exécute entièrement :

```text
supabase/migrations/001_flemicoach.sql
```

Ce fichier crée les tables, index, RLS, fonctions publiques parent et génération du planning.

## 2. Configurer le frontend

Ouvre `config.js` :

```js
export const CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_xxxxxxxx',
  APP_URL: 'https://fao241.github.io/flemicoach/'
};
```

Récupère l'URL et la clé publishable dans **Supabase → Settings → API**.

`APP_URL` doit finir par `/`.

## 3. Configurer Supabase Auth

Dans **Authentication → URL Configuration** :

- `Site URL` : l'URL GitHub Pages de FlemiCoach ;
- ajoute cette même URL dans les `Redirect URLs`.

Exemple :

```text
https://votre-compte.github.io/flemicoach/
```

Tu peux conserver la confirmation d'email activée pour la production.

## 4. Héberger sur GitHub Pages

Crée un dépôt GitHub puis place le contenu de ce dossier à la racine.

Exemple :

```bash
git init
git add .
git commit -m "FlemiCoach production"
git branch -M main
git remote add origin https://github.com/VOTRE_COMPTE/flemicoach.git
git push -u origin main
```

Dans GitHub :

**Settings → Pages → Deploy from a branch → main / root**

Le frontend n'a aucune étape de build.

---

# Rappels email automatiques

Le frontend fonctionne sans les rappels email. Pour activer les rappels :

## 5. Créer un compte Resend

Il faut une clé API Resend et, pour une vraie production, un domaine expéditeur validé.

## 6. Déployer la fonction Supabase

Avec la CLI Supabase installée :

```bash
supabase login
supabase link --project-ref VOTRE_PROJECT_REF
supabase functions deploy send-reminders
```

Génère également une chaîne aléatoire longue pour `CRON_SECRET`.

Puis ajoute les secrets :

```bash
supabase secrets set RESEND_API_KEY=re_xxxxx
supabase secrets set CRON_SECRET=UNE_CHAINE_LONGUE_ALEATOIRE
supabase secrets set REMINDER_FROM_EMAIL="FlemiCoach <rappels@votredomaine.fr>"
supabase secrets set APP_URL="https://VOTRE_COMPTE.github.io/flemicoach/"
```

La fonction utilise les clés Supabase serveur fournies automatiquement à l'environnement Edge Function. Elles ne doivent pas être copiées dans le frontend.

## 7. Planifier la fonction toutes les heures

Ouvre :

```text
supabase/cron.example.sql
```

Remplace :

- `YOUR_PROJECT` ;
- `sb_publishable_YOUR_KEY` ;
- `CHANGE_ME_LONG_RANDOM_SECRET` par exactement le même `CRON_SECRET` configuré plus haut.

Active `pg_cron` et `pg_net` dans Supabase, puis exécute ce SQL.

Le cron appelle `send-reminders` chaque heure. La table `reminder_log` empêche l'envoi multiple du même rappel au même éducateur pour un même événement.

---

# Utilisation

## Première connexion

1. Créer un compte éducateur.
2. Créer l'équipe U13.
3. Renseigner les jours/heures d'entraînement.
4. FlemiCoach génère les séances futures de la saison.
5. Importer la liste des joueurs et le calendrier des matchs, ou les ajouter manuellement.

## Côté parents

Sur le prochain événement :

1. cliquer sur **Partager sur WhatsApp** ;
2. choisir le groupe WhatsApp des parents ;
3. envoyer le message prérempli ;
4. le parent ouvre le lien ;
5. sélectionne son enfant ;
6. choisit Présent ou Absent ;
7. valide.

Aucun compte parent n'est nécessaire.

## Présence réelle

Après ou au début de la séance :

**Présences → sélectionner l'événement → corriger les exceptions → Valider**.

Cela permet de mesurer séparément :

- réponse annoncée ;
- présence réelle ;
- absence malgré une présence annoncée ;
- absence de réponse.

---

# Sécurité

- Toutes les tables applicatives ont RLS activée.
- Un éducateur ne peut accéder qu'aux équipes dont il est membre.
- Le navigateur utilise uniquement une clé Supabase publishable.
- Les parents n'ont aucun accès direct aux tables.
- Le lien parent contient un token UUID aléatoire propre à l'événement.
- Les réponses publiques passent uniquement par les fonctions SQL `get_public_event` et `submit_public_attendance`.
- La fonction de rappel email nécessite un `CRON_SECRET` en plus de la clé d'appel Supabase.
- Les secrets Resend et Supabase serveur restent dans les secrets Edge Functions.

## Limite volontaire de la V1

Toute personne possédant le lien d'un événement peut sélectionner un joueur de cette équipe et répondre à sa place. C'est adapté à un lien diffusé dans un groupe de parents, mais ce n'est pas une authentification forte du parent.

Si FlemiCoach doit être utilisé à plus grande échelle, l'étape suivante est d'ajouter un PIN familial ou un lien individuel signé par joueur.

---

# Structure

```text
flemicoach/
├── index.html
├── styles.css
├── app.js
├── supabase.js
├── config.js
├── config.example.js
├── .gitignore
├── README.md
└── supabase/
    ├── config.toml
    ├── cron.example.sql
    ├── migrations/
    │   └── 001_flemicoach.sql
    └── functions/
        └── send-reminders/
            └── index.ts
```
