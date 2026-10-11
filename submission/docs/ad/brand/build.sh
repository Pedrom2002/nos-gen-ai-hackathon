#!/bin/sh
# Inject the Lethe wordmark and hero frame counts into the template.
cd "$(dirname "$0")"
python3 - <<'PY'
import os
d=open('wordmark.txt').read().strip()
s=open('ad.tpl.html').read().replace('__WORDMARK__',d)
for k,v in (('__NA__','heroA'),):
    s=s.replace(k,str(len(os.listdir('assets/'+v))))
open('ad.html','w').write(s)
PY
