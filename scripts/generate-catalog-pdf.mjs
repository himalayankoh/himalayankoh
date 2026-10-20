import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, renderToFile } from '@react-pdf/renderer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const loadImg = (rel) => {
  const p = path.join(ROOT, rel);
  const data = fs.readFileSync(p);
  const ext = path.extname(p).slice(1).toLowerCase();
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  return `data:image/${mime};base64,${data.toString('base64')}`;
};

const styles = StyleSheet.create({
  page: {
    padding: 24,
    backgroundColor: '#ffffff',
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#1e293b',
  },
  header: {
    backgroundColor: '#0f172a',
    borderRadius: 6,
    padding: 14,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  headerSub: {
    color: '#94a3b8',
    fontSize: 8,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  badge: {
    backgroundColor: '#b45309',
    color: '#ffffff',
    fontSize: 8,
    fontWeight: 'bold',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 24,
    right: 24,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    color: '#64748b',
    fontSize: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48.5%',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
  },
  cardImage: {
    width: '100%',
    height: 105,
    objectFit: 'contain',
    borderRadius: 4,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 2,
  },
  cardAudience: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#b45309',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  cardBullet: {
    fontSize: 8,
    color: '#334155',
    marginBottom: 3,
    lineHeight: 1.3,
  },
  cardFooterBox: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardFooterText: {
    fontSize: 7.5,
    color: '#475569',
    fontWeight: 'bold',
  },
  heroBox: {
    backgroundColor: '#fefce8',
    borderWidth: 1,
    borderColor: '#fef08a',
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#854d0e',
    marginBottom: 4,
  },
  heroText: {
    fontSize: 8.5,
    color: '#713f12',
    lineHeight: 1.4,
  },
  matrixTable: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    marginVertical: 10,
  },
  matrixRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  matrixRowHeader: {
    backgroundColor: '#0f172a',
    color: '#ffffff',
  },
  matrixCol1: { width: '30%', fontSize: 8, fontWeight: 'bold' },
  matrixCol2: { width: '35%', fontSize: 8, color: '#166534', fontWeight: 'bold' },
  matrixCol3: { width: '35%', fontSize: 8, color: '#991b1b' },
  contactBox: {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    borderRadius: 6,
    padding: 16,
    marginTop: 12,
  },
  contactTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: 4,
  },
  contactSub: {
    fontSize: 8.5,
    color: '#94a3b8',
    marginBottom: 12,
    lineHeight: 1.4,
  },
  contactGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  contactItem: {
    width: '31%',
  },
  contactLabel: {
    fontSize: 7.5,
    color: '#d97706',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  contactVal: {
    fontSize: 8.5,
    color: '#ffffff',
    lineHeight: 1.3,
  },
});

const CatalogDocument = () => {
  return React.createElement(Document, null,
    // ==========================================
    // PAGE 1: COVER & LIVESTOCK SALT LICKS
    // ==========================================
    React.createElement(Page, { size: 'A4', style: styles.page },
      // Header
      React.createElement(View, { style: styles.header },
        React.createElement(View, null,
          React.createElement(Text, { style: styles.headerTitle }, 'HIMALAYAN KOH'),
          React.createElement(Text, { style: styles.headerSub }, '100% Authentic Khewra Salt • Direct US Distribution')
        ),
        React.createElement(Text, { style: styles.badge }, '2026 WHOLESALE CATALOG')
      ),

      // Hero Callout
      React.createElement(View, { style: styles.heroBox },
        React.createElement(Text, { style: styles.heroTitle }, 'Factory-Direct Supply for Cattle Ranches, Dairies & Feed Stores'),
        React.createElement(Text, { style: styles.heroText },
          'Mined directly from pristine underground seams of the Khewra Salt Range and stocked in Houston, Texas. Unlike artificial compressed white blocks that melt in pasture rains, our solid-mined rock salt blocks last up to 3x longer and provide 84+ essential bio-available trace minerals.'
        )
      ),

      // Section Title
      React.createElement(Text, { style: { fontSize: 13, fontWeight: 'bold', color: '#0f172a', marginBottom: 10 } },
        'Section 1: Commercial Livestock & Equine Mineral Salt Licks'
      ),

      // Products Grid
      React.createElement(View, { style: styles.grid },
        // Product 1: 30 lb Cattle Lick
        React.createElement(View, { style: styles.card },
          React.createElement(Image, {
            style: styles.cardImage,
            src: loadImg('public/images/legacy/horse-licking-salt.jpg')
          }),
          React.createElement(Text, { style: styles.cardTitle }, '30 lb Red Rock Salt Lick for Cattle'),
          React.createElement(Text, { style: styles.cardAudience }, 'Cattle Ranches & Dairy Herds • Item #2544'),
          React.createElement(Text, { style: styles.cardBullet }, '• 100% solid mined rock salt — won\'t dissolve in rain'),
          React.createElement(Text, { style: styles.cardBullet }, '• Rich in natural iron, calcium, magnesium, potassium'),
          React.createElement(Text, { style: styles.cardBullet }, '• Promotes hydration, digestion, and healthy weight gain'),
          React.createElement(Text, { style: styles.cardBullet }, '• Hard surface prevents biting and over-consumption'),
          React.createElement(View, { style: styles.cardFooterBox },
            React.createElement(Text, { style: styles.cardFooterText }, 'Packaging: 30–50 blocks/pallet'),
            React.createElement(Text, { style: styles.cardFooterText }, 'Origin: Khewra, Pakistan')
          )
        ),

        // Product 2: Horse Lick on Rope
        React.createElement(View, { style: styles.card },
          React.createElement(Image, {
            style: styles.cardImage,
            src: loadImg('public/images/products/white-background/himalayan-round-rope-salt-lick-angle-white.png')
          }),
          React.createElement(Text, { style: styles.cardTitle }, 'Himalayan Pink Salt Lick on Rope'),
          React.createElement(Text, { style: styles.cardAudience }, 'Equine Barns & Feed Stores • Item #2543'),
          React.createElement(Text, { style: styles.cardBullet }, '• Fitted with heavy-duty weather-resistant organic rope'),
          React.createElement(Text, { style: styles.cardBullet }, '• Smooth surface protects animal tongues from abrasion'),
          React.createElement(Text, { style: styles.cardBullet }, '• Deters stall boredom, cribbing, and stress habits'),
          React.createElement(Text, { style: styles.cardBullet }, '• Available in 2.2 lb, 4.4 lb, and 6.6 lb sizes'),
          React.createElement(View, { style: styles.cardFooterBox },
            React.createElement(Text, { style: styles.cardFooterText }, 'Packaging: Master cases / Pallet'),
            React.createElement(Text, { style: styles.cardFooterText }, 'High Retail Margin (45-55%)')
          )
        ),

        // Product 3: 45 lb Bulk Bag
        React.createElement(View, { style: styles.card },
          React.createElement(Image, {
            style: styles.cardImage,
            src: loadImg('public/images/legacy/salt-rock-bag.jpg')
          }),
          React.createElement(Text, { style: styles.cardTitle }, '45 lb Bulk Feed Salt Bag'),
          React.createElement(Text, { style: styles.cardAudience }, 'Dairies & Feed Mills • Item #2539'),
          React.createElement(Text, { style: styles.cardBullet }, '• Unprocessed mineral pink salt in Fine (0.5–1mm) or Coarse'),
          React.createElement(Text, { style: styles.cardBullet }, '• Formulated for TMR dairy ration mixing or free-choice troughs'),
          React.createElement(Text, { style: styles.cardBullet }, '• Zero chemical anti-caking agents, zero artificial binders'),
          React.createElement(Text, { style: styles.cardBullet }, '• Poly-woven moisture-barrier heavy-duty packaging'),
          React.createElement(View, { style: styles.cardFooterBox },
            React.createElement(Text, { style: styles.cardFooterText }, 'Packaging: 50 bags/pallet (2,250 lbs)'),
            React.createElement(Text, { style: styles.cardFooterText }, 'Bulk Truckload Available')
          )
        ),

        // Product 4: 6 lb Standup Pouch
        React.createElement(View, { style: styles.card },
          React.createElement(Image, {
            style: styles.cardImage,
            src: loadImg('public/images/products/white-background/himalayan-6lb-salt-lick-front-white.png')
          }),
          React.createElement(Text, { style: styles.cardTitle }, '6 lb Livestock Mineral Pouch'),
          React.createElement(Text, { style: styles.cardAudience }, 'Feed Stores & Small Herds • Item #2536'),
          React.createElement(Text, { style: styles.cardBullet }, '• Resealable zip-lock heavy pouch with clear view window'),
          React.createElement(Text, { style: styles.cardBullet }, '• Premium retail display for farm, feed, and tack stores'),
          React.createElement(Text, { style: styles.cardBullet }, '• Ideal for horses, goats, sheep, and show cattle'),
          React.createElement(Text, { style: styles.cardBullet }, '• Contains individual UPC barcode ready for register scan'),
          React.createElement(View, { style: styles.cardFooterBox },
            React.createElement(Text, { style: styles.cardFooterText }, 'Packaging: 8 pouches/case'),
            React.createElement(Text, { style: styles.cardFooterText }, 'Fast Shelf Turnover')
          )
        )
      ),

      // Footer
      React.createElement(View, { style: styles.footer },
        React.createElement(Text, null, 'Himalayan Koh • 12620 FM 1960 W Ste A-4, Houston, TX 77065 • (832) 224-6466'),
        React.createElement(Text, null, 'Page 1 of 2 • himalayankoh.com/wholesale')
      )
    ),

    // ==========================================
    // PAGE 2: FOOD GRADE SALT & WHOLESALE ORDERING
    // ==========================================
    React.createElement(Page, { size: 'A4', style: styles.page },
      // Header
      React.createElement(View, { style: styles.header },
        React.createElement(View, null,
          React.createElement(Text, { style: styles.headerTitle }, 'HIMALAYAN KOH'),
          React.createElement(Text, { style: styles.headerSub }, 'Food Service, Culinary & Ordering Terms')
        ),
        React.createElement(Text, { style: styles.badge }, 'SPECIFICATIONS & LOGISTICS')
      ),

      // Section Title
      React.createElement(Text, { style: { fontSize: 13, fontWeight: 'bold', color: '#0f172a', marginBottom: 8 } },
        'Section 2: Food Grade Culinary Pink Salt'
      ),

      // Culinary Products Row
      React.createElement(View, { style: styles.grid },
        // Product 5: 16 oz Jar
        React.createElement(View, { style: styles.card },
          React.createElement(Image, {
            style: styles.cardImage,
            src: loadImg('public/images/legacy/pink-salt-16oz-jar.jpg')
          }),
          React.createElement(Text, { style: styles.cardTitle }, '16 oz Himalayan Edible Pink Salt Jar'),
          React.createElement(Text, { style: styles.cardAudience }, 'Retailers & Specialty Grocers • Item #2526'),
          React.createElement(Text, { style: styles.cardBullet }, '• 100% pure food-grade fine grain pink salt'),
          React.createElement(Text, { style: styles.cardBullet }, '• Unrefined, unbleached, with all trace minerals intact'),
          React.createElement(Text, { style: styles.cardBullet }, '• Clear shaker jar with dual sprinkle/pour lid'),
          React.createElement(View, { style: styles.cardFooterBox },
            React.createElement(Text, { style: styles.cardFooterText }, 'Case Pack: 12 or 24 jars'),
            React.createElement(Text, { style: styles.cardFooterText }, 'UPC Barcoded')
          )
        ),

        // Product 6: Searing Blocks & Bulk
        React.createElement(View, { style: styles.card },
          React.createElement(Image, {
            style: styles.cardImage,
            src: loadImg('public/images/legacy/bowl-of-salt.jpg')
          }),
          React.createElement(Text, { style: styles.cardTitle }, 'Cooking Slabs & Bulk Foodservice'),
          React.createElement(Text, { style: styles.cardAudience }, 'Butchers, Restaurants & Foodservice'),
          React.createElement(Text, { style: styles.cardBullet }, '• Hand-cut pink salt searing blocks (8x4x2" & 12x8x1.5")'),
          React.createElement(Text, { style: styles.cardBullet }, '• 25 lb & 55 lb bulk culinary food-service sacks'),
          React.createElement(Text, { style: styles.cardBullet }, '• FDA-compliant, Halal certified, and lab tested'),
          React.createElement(View, { style: styles.cardFooterBox },
            React.createElement(Text, { style: styles.cardFooterText }, 'Custom Sizing Available'),
            React.createElement(Text, { style: styles.cardFooterText }, 'Houston Warehouse Stock')
          )
        )
      ),

      // Comparison Table
      React.createElement(Text, { style: { fontSize: 11, fontWeight: 'bold', color: '#0f172a', marginTop: 6, marginBottom: 4 } },
        'Why Solid-Mined Rock Salt Outperforms Pressed Salt Blocks:'
      ),
      React.createElement(View, { style: styles.matrixTable },
        React.createElement(View, { style: [styles.matrixRow, styles.matrixRowHeader] },
          React.createElement(Text, { style: [styles.matrixCol1, { color: '#ffffff' }] }, 'Feature'),
          React.createElement(Text, { style: [styles.matrixCol2, { color: '#ffffff' }] }, 'Himalayan Koh Solid Rock'),
          React.createElement(Text, { style: [styles.matrixCol3, { color: '#ffffff' }] }, 'Standard White Pressed Salt')
        ),
        React.createElement(View, { style: styles.matrixRow },
          React.createElement(Text, { style: styles.matrixCol1 }, 'Durability in Rain'),
          React.createElement(Text, { style: styles.matrixCol2 }, 'Weather-resistant, lasts 3x longer'),
          React.createElement(Text, { style: styles.matrixCol3 }, 'Dissolves & crumbles rapidly in rain')
        ),
        React.createElement(View, { style: styles.matrixRow },
          React.createElement(Text, { style: styles.matrixCol1 }, 'Mineral Spectrum'),
          React.createElement(Text, { style: styles.matrixCol2 }, '84 Natural Trace Elements'),
          React.createElement(Text, { style: styles.matrixCol3 }, 'Stripped 99% pure sodium chloride')
        ),
        React.createElement(View, { style: styles.matrixRow },
          React.createElement(Text, { style: styles.matrixCol1 }, 'Chemical Binders'),
          React.createElement(Text, { style: styles.matrixCol2 }, '100% Natural, ZERO artificial binders'),
          React.createElement(Text, { style: styles.matrixCol3 }, 'Often uses glues and pressing agents')
        ),
        React.createElement(View, { style: [styles.matrixRow, { borderBottomWidth: 0 }] },
          React.createElement(Text, { style: styles.matrixCol1 }, 'Animal Acceptance'),
          React.createElement(Text, { style: styles.matrixCol2 }, 'High palatability, self-regulating'),
          React.createElement(Text, { style: styles.matrixCol3 }, 'Prone to biting, chipping & wastage')
        )
      ),

      // Ordering & Logistics Box
      React.createElement(View, { style: styles.contactBox },
        React.createElement(Text, { style: styles.contactTitle }, 'Wholesale Ordering, Freight & Dealer Accounts'),
        React.createElement(Text, { style: styles.contactSub },
          'We supply cattle ranches, dairy farms, and feed stores across the continental US with reliable freight delivery. Full liftgate service is available for ranches and facilities without a dedicated loading dock.'
        ),
        React.createElement(View, { style: styles.contactGrid },
          React.createElement(View, { style: styles.contactItem },
            React.createElement(Text, { style: styles.contactLabel }, 'Order Minimums (MOQ)'),
            React.createElement(Text, { style: styles.contactVal }, 'Half-Pallet (~1,100 lbs)\nFull Pallet (2,250 lbs)\nMulti-Pallet & FCL Containers')
          ),
          React.createElement(View, { style: styles.contactItem },
            React.createElement(Text, { style: styles.contactLabel }, 'Dispatch & Delivery'),
            React.createElement(Text, { style: styles.contactVal }, 'Ships in 1–2 business days\nDirect from Houston, TX\nLiftgate service available')
          ),
          React.createElement(View, { style: styles.contactItem },
            React.createElement(Text, { style: styles.contactLabel }, 'Direct Contact'),
            React.createElement(Text, { style: styles.contactVal }, 'Phone: (832) 224-6466\norders@himalayankoh.com\nhimalayankoh.com/wholesale')
          )
        )
      ),

      // Footer
      React.createElement(View, { style: styles.footer },
        React.createElement(Text, null, 'Himalayan Koh • 12620 FM 1960 W Ste A-4, Houston, TX 77065 • (832) 224-6466'),
        React.createElement(Text, null, 'Page 2 of 2 • himalayankoh.com/wholesale')
      )
    )
  );
};

const outputPath = path.join(ROOT, 'public', 'Himalayan-Koh-Wholesale-Catalog-2026.pdf');
console.log('Generating PDF catalog with embedded images at:', outputPath);

renderToFile(React.createElement(CatalogDocument), outputPath)
  .then(() => {
    console.log('SUCCESS: Himalayan-Koh-Wholesale-Catalog-2026.pdf generated!');
  })
  .catch((err) => {
    console.error('ERROR generating PDF:', err);
    process.exit(1);
  });
