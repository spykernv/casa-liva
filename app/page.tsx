import { redirect } from "next/navigation";

/* La racine n'affiche rien : on ouvre Casa Liva sur la question qui
   compte — « qu'est-ce que tout le monde fait aujourd'hui ? » */
export default function Home() {
  redirect("/aujourdhui");
}
