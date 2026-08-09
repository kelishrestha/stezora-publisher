<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
	<xsl:output method="html" encoding="UTF-8" indent="yes"/>
	<xsl:template match="/">
		<html lang="en">
			<head>
				<meta charset="UTF-8"/>
				<meta name="viewport" content="width=device-width, initial-scale=1"/>
				<title>Feed</title>
				<style>
					body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 2rem; color: #1e293b; }
					h1 { font-size: 1.5rem; }
					ul { list-style: none; padding: 0; }
					li { margin: 1rem 0; }
					a { color: #0f172a; text-decoration: none; font-weight: 600; }
					a:hover { text-decoration: underline; }
					p { margin: 0.25rem 0; color: #475569; }
				</style>
			</head>
			<body>
				<h1>RSS Feed</h1>
				<p><xsl:value-of select="/rss/channel/description"/></p>
				<ul>
					<xsl:for-each select="/rss/channel/item">
						<li>
							<a href="{link}"><xsl:value-of select="title"/></a>
							<p><xsl:value-of select="pubDate"/></p>
						</li>
					</xsl:for-each>
				</ul>
			</body>
		</html>
	</xsl:template>
</xsl:stylesheet>
