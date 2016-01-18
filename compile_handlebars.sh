command -v handlebars >/dev/null 2>&1 || { echo >&2 "handlebars not found. Please install using npm install -g handlebars"; exit 1; }

OUTPUTFILE="dist/html.templates.js";

mkdir -p dist 2> /dev/null;
truncate -s 0 "$OUTPUTFILE"; #empty file

find ./html -name "*.hbs" -exec handlebars -e "hbs" -m "{}" >> "$OUTPUTFILE" \;