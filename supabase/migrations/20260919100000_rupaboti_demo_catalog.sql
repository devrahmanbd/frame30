-- Rupaboti Beauty demo catalog seed (2026-09-19).
-- Merchant: Rupaboti Beauty / slug rupaboti-beauty (id b0ba0000-0000-4000-8000-000000000001).
-- Idempotent: fixed UUIDs + ON CONFLICT guards throughout; safe to re-run.
-- Order: merchant/members/settings/subscription -> categories -> brands -> products -> variants.
-- Does NOT touch themes, widgets, or other merchants. No deletes.

-- ---------------------------------------------------------------- merchant ---
insert into public.merchants (id, name, slug, currency_code, status, kyc_status)
values ('b0ba0000-0000-4000-8000-000000000001','Rupaboti Beauty','rupaboti-beauty','BDT','active','pending')
on conflict (slug) do update set name = excluded.name, status = 'active',
  currency_code = 'BDT', updated_at = now();

insert into public.merchant_members (merchant_id, user_id, role, status)
values ('b0ba0000-0000-4000-8000-000000000001','e77750ea-ac6c-4d63-ad22-ffa7f6a5253c','owner','active')
on conflict do nothing;

insert into public.merchant_settings (merchant_id, cod_enabled, setup_steps)
values ('b0ba0000-0000-4000-8000-000000000001', true, '{"store_created": true}'::jsonb)
on conflict (merchant_id) do update set cod_enabled = true,
  setup_steps = excluded.setup_steps, updated_at = now();

insert into public.subscriptions (merchant_id, plan, status, trial_ends_at)
values ('b0ba0000-0000-4000-8000-000000000001','launch','trialing', now() + interval '14 days')
on conflict do nothing;

-- ---------------------------------------------------------- top categories ---
insert into public.categories (id, merchant_id, name, slug, description, parent_id) values
  ('c0ba0000-0000-4000-8000-000000000101','b0ba0000-0000-4000-8000-000000000001','Skin Care','skin-care','Everyday skin care essentials', null),
  ('c0ba0000-0000-4000-8000-000000000102','b0ba0000-0000-4000-8000-000000000001','Makeup','makeup','Everyday makeup essentials', null),
  ('c0ba0000-0000-4000-8000-000000000103','b0ba0000-0000-4000-8000-000000000001','Combos','combos','Value combo packs', null),
  ('c0ba0000-0000-4000-8000-000000000104','b0ba0000-0000-4000-8000-000000000001','Ingredients','ingredients','Shop by hero ingredient', null),
  ('c0ba0000-0000-4000-8000-000000000105','b0ba0000-0000-4000-8000-000000000001','Concern','concern','Shop by skin concern', null)
on conflict (id) do update set name = excluded.name, slug = excluded.slug,
  description = excluded.description, parent_id = excluded.parent_id, updated_at = now();

-- ---------------------------------------------------------- subcategories ----
-- Face + Body + Hair live under Skin Care; Lips/Foundation/Eye under Makeup;
-- Collagen/HA/Vit-C/Kojic under Ingredients; concerns under Concern.
insert into public.categories (id, merchant_id, name, slug, description, parent_id) values
  ('c0ba0000-0000-4000-8000-000000000201','b0ba0000-0000-4000-8000-000000000001','Night Cream','night-cream','Overnight repair creams','c0ba0000-0000-4000-8000-000000000101'),
  ('c0ba0000-0000-4000-8000-000000000202','b0ba0000-0000-4000-8000-000000000001','Serum','serum','Concentrated face serums','c0ba0000-0000-4000-8000-000000000101'),
  ('c0ba0000-0000-4000-8000-000000000203','b0ba0000-0000-4000-8000-000000000001','Cleanser / Face Wash','cleanser-face-wash','Gentle daily cleansers','c0ba0000-0000-4000-8000-000000000101'),
  ('c0ba0000-0000-4000-8000-000000000204','b0ba0000-0000-4000-8000-000000000001','Moisturizer','moisturizer','Daily hydration','c0ba0000-0000-4000-8000-000000000101'),
  ('c0ba0000-0000-4000-8000-000000000205','b0ba0000-0000-4000-8000-000000000001','Toner','toner','Balancing toners & mists','c0ba0000-0000-4000-8000-000000000101'),
  ('c0ba0000-0000-4000-8000-000000000206','b0ba0000-0000-4000-8000-000000000001','Body Cream','body-cream','Rich body creams & butters','c0ba0000-0000-4000-8000-000000000101'),
  ('c0ba0000-0000-4000-8000-000000000207','b0ba0000-0000-4000-8000-000000000001','Lotion','lotion','Lightweight body lotions','c0ba0000-0000-4000-8000-000000000101'),
  ('c0ba0000-0000-4000-8000-000000000208','b0ba0000-0000-4000-8000-000000000001','Body Scrub','body-scrub','Exfoliating body scrubs','c0ba0000-0000-4000-8000-000000000101'),
  ('c0ba0000-0000-4000-8000-000000000209','b0ba0000-0000-4000-8000-000000000001','Shampoo','shampoo','Hair shampoos','c0ba0000-0000-4000-8000-000000000101'),
  ('c0ba0000-0000-4000-8000-000000000210','b0ba0000-0000-4000-8000-000000000001','Oil','hair-oil','Hair oils & treatments','c0ba0000-0000-4000-8000-000000000101'),
  ('c0ba0000-0000-4000-8000-000000000211','b0ba0000-0000-4000-8000-000000000001','Lips','lips','Lipsticks & lip care','c0ba0000-0000-4000-8000-000000000102'),
  ('c0ba0000-0000-4000-8000-000000000212','b0ba0000-0000-4000-8000-000000000001','Foundation','foundation','Base & foundation','c0ba0000-0000-4000-8000-000000000102'),
  ('c0ba0000-0000-4000-8000-000000000213','b0ba0000-0000-4000-8000-000000000001','Eye Care','eye-care','Under-eye & lash care','c0ba0000-0000-4000-8000-000000000102'),
  ('c0ba0000-0000-4000-8000-000000000214','b0ba0000-0000-4000-8000-000000000001','Collagen','collagen','Collagen-boost formulas','c0ba0000-0000-4000-8000-000000000104'),
  ('c0ba0000-0000-4000-8000-000000000215','b0ba0000-0000-4000-8000-000000000001','Hyaluronic Acid','hyaluronic-acid','HA hydration range','c0ba0000-0000-4000-8000-000000000104'),
  ('c0ba0000-0000-4000-8000-000000000216','b0ba0000-0000-4000-8000-000000000001','Vitamin C','vitamin-c','Brightening vitamin C','c0ba0000-0000-4000-8000-000000000104'),
  ('c0ba0000-0000-4000-8000-000000000217','b0ba0000-0000-4000-8000-000000000001','Kojic Acid','kojic-acid','Even-tone kojic range','c0ba0000-0000-4000-8000-000000000104'),
  ('c0ba0000-0000-4000-8000-000000000218','b0ba0000-0000-4000-8000-000000000001','Acne Care','acne-care','Breakout control','c0ba0000-0000-4000-8000-000000000105'),
  ('c0ba0000-0000-4000-8000-000000000219','b0ba0000-0000-4000-8000-000000000001','Brightening','brightening','Glow & radiance','c0ba0000-0000-4000-8000-000000000105'),
  ('c0ba0000-0000-4000-8000-000000000220','b0ba0000-0000-4000-8000-000000000001','Dark Spots','dark-spots','Spot correction','c0ba0000-0000-4000-8000-000000000105'),
  ('c0ba0000-0000-4000-8000-000000000221','b0ba0000-0000-4000-8000-000000000001','Dry Skin','dry-skin','Deep nourishment','c0ba0000-0000-4000-8000-000000000105'),
  ('c0ba0000-0000-4000-8000-000000000222','b0ba0000-0000-4000-8000-000000000001','Oily Skin','oily-skin','Oil control & mattifying','c0ba0000-0000-4000-8000-000000000105')
on conflict (id) do update set name = excluded.name, slug = excluded.slug,
  description = excluded.description, parent_id = excluded.parent_id, updated_at = now();

-- ------------------------------------------------------------------ brands ---
insert into public.brands (id, merchant_id, name, slug, description) values
  ('d0ba0000-0000-4000-8000-000000000301','b0ba0000-0000-4000-8000-000000000001','Rupaboti Naturals','rupaboti-naturals','Signature house blends made in Dhaka'),
  ('d0ba0000-0000-4000-8000-000000000302','b0ba0000-0000-4000-8000-000000000001','GlowLab Dhaka','glowlab-dhaka','Clinical actives at honest prices'),
  ('d0ba0000-0000-4000-8000-000000000303','b0ba0000-0000-4000-8000-000000000001','Herbal Roots','herbal-roots','Ayurvedic-inspired botanicals'),
  ('d0ba0000-0000-4000-8000-000000000304','b0ba0000-0000-4000-8000-000000000001','SkinPure','skinpure','Sensitive-skin safe minimalism'),
  ('d0ba0000-0000-4000-8000-000000000305','b0ba0000-0000-4000-8000-000000000001','BeautyVerse','beautyverse','Trend makeup & accessories')
on conflict (id) do update set name = excluded.name, slug = excluded.slug,
  description = excluded.description, updated_at = now();

-- ---------------------------------------------------------------- products ---
-- BDT prices stored only on variants (price_amount_minor_int); products carry
-- title/slug/status/tags/brand/category for storefront reads.
insert into public.products
  (id, merchant_id, brand_id, category_id, title, slug, status, tags, description, search_doc) values
  ('e0ba0000-0000-4000-8000-000000000401','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000301','c0ba0000-0000-4000-8000-000000000201','Rupaboti Night Repair Cream 50g','rupaboti-night-repair-cream','active','{bestseller,night-care,face}','Overnight niacinamide + shea repair cream for dull Dhaka skin','night cream repair niacinamide shea dull skin'),
  ('e0ba0000-0000-4000-8000-000000000402','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000302','c0ba0000-0000-4000-8000-000000000202','GlowLab Vitamin C Serum 20% 30ml','glowlab-vitamin-c-serum','active','{bestseller,serum,brightening}','20% ethylated vitamin C + ferulic glow serum','vitamin c serum brightening dark spots glow'),
  ('e0ba0000-0000-4000-8000-000000000403','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000303','c0ba0000-0000-4000-8000-000000000203','Herbal Roots Neem Face Wash 100ml','herbal-roots-neem-face-wash','active','{face-wash,acne-care,daily}','Neem + tea-tree gentle foaming cleanser','neem face wash acne oily cleanser'),
  ('e0ba0000-0000-4000-8000-000000000404','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000304','c0ba0000-0000-4000-8000-000000000204','SkinPure Hyaluronic Moisturizer 50ml','skinpure-hyaluronic-moisturizer','active','{moisturizer,hyaluronic-acid,dry-skin}','5x HA + ceramides gel-cream, fragrance free','hyaluronic moisturizer ceramides dry skin hydration'),
  ('e0ba0000-0000-4000-8000-000000000405','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000305','c0ba0000-0000-4000-8000-000000000205','BeautyVerse Rose Toner 120ml','beautyverse-rose-toner','active','{toner,rose,sensitive}','Rose water + glycerin balancing mist-toner','rose toner mist sensitive pores'),
  ('e0ba0000-0000-4000-8000-000000000406','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000301','c0ba0000-0000-4000-8000-000000000206','Rupaboti Body Butter Cream 200ml','rupaboti-body-butter-cream','active','{body-cream,dry-skin,winter}','Cocoa + kokum winter body butter','body butter cream dry skin winter cocoa'),
  ('e0ba0000-0000-4000-8000-000000000407','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000302','c0ba0000-0000-4000-8000-000000000207','GlowLab Shea Body Lotion 250ml','glowlab-shea-body-lotion','active','{lotion,body,daily}','Fast-absorb 10% shea daily lotion','shea body lotion daily soft skin'),
  ('e0ba0000-0000-4000-8000-000000000408','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000303','c0ba0000-0000-4000-8000-000000000208','Herbal Roots Coffee Body Scrub 200g','herbal-roots-coffee-body-scrub','active','{body-scrub,exfoliate,brightening}','Arabica coffee + sugar glow scrub','coffee body scrub exfoliate glow brightening'),
  ('e0ba0000-0000-4000-8000-000000000409','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000304','c0ba0000-0000-4000-8000-000000000209','SkinPure Argan Shampoo 300ml','skinpure-argan-shampoo','active','{shampoo,hair,sulfate-free}','Sulfate-free argan + aloe shampoo','argan shampoo sulfate free hair fall aloe'),
  ('e0ba0000-0000-4000-8000-000000000410','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000303','c0ba0000-0000-4000-8000-000000000210','Herbal Roots Onion Hair Oil 200ml','herbal-roots-onion-hair-oil','active','{hair-oil,hair-fall,bestseller}','Red onion + curry leaf growth oil','onion hair oil hair fall growth curry leaf'),
  ('e0ba0000-0000-4000-8000-000000000411','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000305','c0ba0000-0000-4000-8000-000000000211','BeautyVerse Matte Lipstick Set (6 shades)','beautyverse-matte-lipstick-set','active','{lips,makeup,gifting}','6-shade velvet matte wardrobe, BDT budgets','matte lipstick set makeup gift lips shades'),
  ('e0ba0000-0000-4000-8000-000000000412','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000302','c0ba0000-0000-4000-8000-000000000212','GlowLab HD Foundation - Porcelain 30ml','glowlab-hd-foundation-porcelain','active','{foundation,makeup,medium-coverage}','Breathable HD foundation for humid weather','foundation porcelain hd makeup coverage humid'),
  ('e0ba0000-0000-4000-8000-000000000413','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000301','c0ba0000-0000-4000-8000-000000000213','Rupaboti Under-Eye Gel 15ml','rupaboti-under-eye-gel','active','{eye-care,dark-circles,caffeine}','Caffeine + cucumber depuff gel','under eye gel dark circles caffeine puffy'),
  ('e0ba0000-0000-4000-8000-000000000414','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000304','c0ba0000-0000-4000-8000-000000000214','SkinPure Collagen Night Serum 30ml','skinpure-collagen-night-serum','active','{collagen,serum,firming}','Peptides + collagen firming night serum','collagen serum peptides firming night wrinkles'),
  ('e0ba0000-0000-4000-8000-000000000415','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000302','c0ba0000-0000-4000-8000-000000000215','GlowLab Hyaluronic Acid Essence 100ml','glowlab-hyaluronic-essence','active','{hyaluronic-acid,essence,hydration}','7-weight HA watery essence toner','hyaluronic essence hydration toner dry skin'),
  ('e0ba0000-0000-4000-8000-000000000416','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000301','c0ba0000-0000-4000-8000-000000000216','Rupaboti Vitamin C Brightening Cream 50g','rupaboti-vitamin-c-cream','active','{vitamin-c,brightening,day-cream}','10% vitamin C daily glow moisturizer','vitamin c cream brightening glow day spots'),
  ('e0ba0000-0000-4000-8000-000000000417','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000304','c0ba0000-0000-4000-8000-000000000217','SkinPure Kojic Acid Soap Bar 100g','skinpure-kojic-soap','active','{kojic-acid,soap,even-tone}','2% kojic + licorice even-tone bar','kojic soap even tone dark spots licorice'),
  ('e0ba0000-0000-4000-8000-000000000418','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000303','c0ba0000-0000-4000-8000-000000000218','Herbal Roots Acne Spot Gel 20g','herbal-roots-acne-spot-gel','active','{acne-care,spot-treatment,tea-tree}','2% salicylic overnight dot gel','acne spot gel salicylic pimple tea tree'),
  ('e0ba0000-0000-4000-8000-000000000419','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000305','c0ba0000-0000-4000-8000-000000000219','BeautyVerse Brightening Sheet Mask (5 pcs)','beautyverse-brightening-mask','active','{brightening,mask,weekly}','Niacinamide + rice weekly glow masks','sheet mask brightening niacinamide rice glow'),
  ('e0ba0000-0000-4000-8000-000000000420','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000302','c0ba0000-0000-4000-8000-000000000220','GlowLab Dark Spot Corrector 30ml','glowlab-dark-spot-corrector','active','{dark-spots,tranexamic,even-tone}','Tranexamic + alpha arbutin spot serum','dark spot corrector tranexamic arbutin melasma'),
  ('e0ba0000-0000-4000-8000-000000000421','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000301','c0ba0000-0000-4000-8000-000000000221','Rupaboti Dry Skin Rescue Balm 50g','rupaboti-dry-skin-balm','active','{dry-skin,balm,barrier}','Squalane + oat slugging balm','dry skin balm squalane oat barrier winter'),
  ('e0ba0000-0000-4000-8000-000000000422','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000304','c0ba0000-0000-4000-8000-000000000222','SkinPure Oil-Control Clay Mask 100g','skinpure-clay-mask','active','{oily-skin,clay-mask,pores}','Kaolin + zinc weekly pore mask','clay mask oily pores kaolin zinc blackheads'),
  ('e0ba0000-0000-4000-8000-000000000423','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000301','c0ba0000-0000-4000-8000-000000000103','Rupaboti Bridal Glow Combo (5-step)','rupaboti-bridal-glow-combo','active','{combos,bridal,gifting,bestseller}','Wash + toner + serum + cream + mask ritual box','bridal combo gift box glow wedding skincare set'),
  ('e0ba0000-0000-4000-8000-000000000424','b0ba0000-0000-4000-8000-000000000001','d0ba0000-0000-4000-8000-000000000302','c0ba0000-0000-4000-8000-000000000103','GlowLab Skin + Makeup Festive Combo','glowlab-festive-combo','active','{combos,festive,makeup,skincare}','Serum + moisturizer + foundation + lipstick kit','festive combo makeup skincare gift eid puja set')
on conflict (id) do update set title = excluded.title, slug = excluded.slug, status = 'active',
  tags = excluded.tags, brand_id = excluded.brand_id, category_id = excluded.category_id,
  description = excluded.description, search_doc = excluded.search_doc, updated_at = now();

-- ----------------------------------------------------------------- variants ---
-- One Default variant per product. Money in integer minor units (BDT paisa).
insert into public.product_variants
  (id, merchant_id, product_id, name, sku, price_amount_minor_int, compare_at_amount_minor_int, currency_code, stock_quantity, position) values
  ('f0ba0000-0000-4000-8000-000000000501','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000401','Default','RB-401-D',85000,120000,'BDT',64,0),
  ('f0ba0000-0000-4000-8000-000000000502','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000402','Default','RB-402-D',125000,165000,'BDT',48,0),
  ('f0ba0000-0000-4000-8000-000000000503','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000403','Default','RB-403-D',38000,50000,'BDT',100,0),
  ('f0ba0000-0000-4000-8000-000000000504','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000404','Default','RB-404-D',95000,130000,'BDT',55,0),
  ('f0ba0000-0000-4000-8000-000000000505','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000405','Default','RB-405-D',55000,75000,'BDT',80,0),
  ('f0ba0000-0000-4000-8000-000000000506','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000406','Default','RB-406-D',68000,90000,'BDT',60,0),
  ('f0ba0000-0000-4000-8000-000000000507','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000407','Default','RB-407-D',62000,82000,'BDT',72,0),
  ('f0ba0000-0000-4000-8000-000000000508','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000408','Default','RB-408-D',54000,72000,'BDT',66,0),
  ('f0ba0000-0000-4000-8000-000000000509','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000409','Default','RB-409-D',48000,65000,'BDT',90,0),
  ('f0ba0000-0000-4000-8000-000000000510','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000410','Default','RB-410-D',42000,58000,'BDT',95,0),
  ('f0ba0000-0000-4000-8000-000000000511','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000411','Default','RB-411-D',99000,140000,'BDT',40,0),
  ('f0ba0000-0000-4000-8000-000000000512','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000412','Default','RB-412-D',115000,150000,'BDT',36,0),
  ('f0ba0000-0000-4000-8000-000000000513','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000413','Default','RB-413-D',72000,95000,'BDT',58,0),
  ('f0ba0000-0000-4000-8000-000000000514','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000414','Default','RB-414-D',135000,180000,'BDT',32,0),
  ('f0ba0000-0000-4000-8000-000000000515','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000415','Default','RB-415-D',105000,140000,'BDT',44,0),
  ('f0ba0000-0000-4000-8000-000000000516','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000416','Default','RB-416-D',89000,120000,'BDT',52,0),
  ('f0ba0000-0000-4000-8000-000000000517','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000417','Default','RB-417-D',35000,48000,'BDT',100,0),
  ('f0ba0000-0000-4000-8000-000000000518','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000418','Default','RB-418-D',45000,60000,'BDT',85,0),
  ('f0ba0000-0000-4000-8000-000000000519','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000419','Default','RB-419-D',65000,85000,'BDT',70,0),
  ('f0ba0000-0000-4000-8000-000000000520','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000420','Default','RB-420-D',98000,130000,'BDT',42,0),
  ('f0ba0000-0000-4000-8000-000000000521','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000421','Default','RB-421-D',76000,100000,'BDT',50,0),
  ('f0ba0000-0000-4000-8000-000000000522','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000422','Default','RB-422-D',59000,78000,'BDT',68,0),
  ('f0ba0000-0000-4000-8000-000000000523','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000423','Default','RB-423-D',199000,280000,'BDT',25,0),
  ('f0ba0000-0000-4000-8000-000000000524','b0ba0000-0000-4000-8000-000000000001','e0ba0000-0000-4000-8000-000000000424','Default','RB-424-D',249000,340000,'BDT',20,0)
on conflict (id) do update set name = excluded.name, sku = excluded.sku,
  price_amount_minor_int = excluded.price_amount_minor_int,
  compare_at_amount_minor_int = excluded.compare_at_amount_minor_int,
  currency_code = excluded.currency_code, stock_quantity = excluded.stock_quantity,
  position = excluded.position, updated_at = now();
