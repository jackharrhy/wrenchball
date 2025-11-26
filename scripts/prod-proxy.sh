ssh -L 5432:$(ssh jack@jackharrhy.com "docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' core-sluggers_super_draft_db-1"):5432 jack@jackharrhy.com
