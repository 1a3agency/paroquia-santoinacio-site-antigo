# Old Site Archive

Static public-content archive of `https://santoinaciosp.com.br`.

This project intentionally does not contain the WordPress CMS, administration area, database, or private content. It is a separate Vercel deployment used to preserve the public site while the new site is reviewed.

## Rebuild the archive

```bash
node archive-site.mjs
```

The generated files are deployed as static assets. The archive report records any URLs that could not be downloaded.
