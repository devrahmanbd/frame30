-- Songoskriti Heritage demo seed (2026-09-24).
-- Merchant: Songoskriti Heritage / slug songoskriti-heritage (id b50a0000-0000-4000-8000-000000000001).
-- Idempotent: fixed UUIDs + ON CONFLICT guards throughout; safe to re-run.
-- Order: merchant/members/settings/subscription -> categories -> brands ->
--   products -> variants -> collections -> collection_products.
-- Does NOT touch themes, widgets, or other merchants. No deletes.
-- Every catalogue row is flagged is_demo, so theme_purge_demo fully reverses it.
--
-- Homepage designation (static-SQL form; theme tables are a retired write
-- surface, so no theme_drafts merge here — the import RPCs do that at
-- install time): the `new-in` collection feeds homepage rail 1
-- (product_rail collection "new-in" in src/lib/themes/songoskriti/homepage.ts)
-- and `bestsellers` feeds rail 2. collection_products below wires both rails.
-- Image refs point at public/ph/songoskriti/* final paths (Task 3 manifest);
-- files land via generation, MediaFrame/placeholder fallback covers gaps.

-- ---------------------------------------------------------------- merchant ---
insert into public.merchants (id, name, slug, currency_code, status, kyc_status)
values ('b50a0000-0000-4000-8000-000000000001','Songoskriti Heritage','songoskriti-heritage','BDT','active','pending')
on conflict (slug) do update set name = excluded.name, status = 'active',
  currency_code = 'BDT', updated_at = now();

insert into public.merchant_members (merchant_id, user_id, role, status)
values ('b50a0000-0000-4000-8000-000000000001','e77750ea-ac6c-4d63-ad22-ffa7f6a5253c','owner','active')
on conflict do nothing;

insert into public.merchant_settings (merchant_id, cod_enabled, setup_steps)
values ('b50a0000-0000-4000-8000-000000000001', true, '{"store_created": true}'::jsonb)
on conflict (merchant_id) do update set cod_enabled = true,
  setup_steps = excluded.setup_steps, updated_at = now();

insert into public.subscriptions (merchant_id, plan, status, trial_ends_at)
values ('b50a0000-0000-4000-8000-000000000001','launch','trialing', now() + interval '14 days')
on conflict do nothing;

-- ---------------------------------------------------------- top categories ---
-- Mirrors the six homepage shop-by-category circles (spec §2).
insert into public.categories (id, merchant_id, name, slug, description, parent_id, is_demo) values
  ('c50a0000-0000-4000-8000-000000001001','b50a0000-0000-4000-8000-000000000001','Women','women','Handloom sarees and festive drapes woven in Tangail and Sonargaon', null, true),
  ('c50a0000-0000-4000-8000-000000001002','b50a0000-0000-4000-8000-000000000001','Men','men','Rajshahi silk panjabis and breathable khadi kurtas', null, true),
  ('c50a0000-0000-4000-8000-000000001003','b50a0000-0000-4000-8000-000000000001','Kids','kids','Festive silk sets for young celebrations', null, true),
  ('c50a0000-0000-4000-8000-000000001004','b50a0000-0000-4000-8000-000000000001','Home & Living','living','Nakshi kantha quilts and artisan home textiles', null, true),
  ('c50a0000-0000-4000-8000-000000001005','b50a0000-0000-4000-8000-000000000001','Jewellery','jewellery','Hand-engraved brass pieces from Dhamrai metalworkers', null, true),
  ('c50a0000-0000-4000-8000-000000001006','b50a0000-0000-4000-8000-000000000001','New In','new-in','Fresh off the loom for this festive season', null, true)
on conflict (id) do update set name = excluded.name, slug = excluded.slug,
  description = excluded.description, parent_id = excluded.parent_id,
  is_demo = true, updated_at = now();

-- ------------------------------------------------------------------ brands ---
insert into public.brands (id, merchant_id, name, slug, description) values
  ('d50a0000-0000-4000-8000-000000001201','b50a0000-0000-4000-8000-000000000001','Songoskriti Studio','songoskriti-studio','House heritage line, cut from handloom cloth'),
  ('d50a0000-0000-4000-8000-000000001202','b50a0000-0000-4000-8000-000000000001','Tangail Weave Collective','tangail-weave-collective','Pit-loom weaving families of Delduar, Tangail')
on conflict (id) do update set name = excluded.name, slug = excluded.slug,
  description = excluded.description, updated_at = now();

-- ---------------------------------------------------------------- products ---
-- BDT prices stored only on variants (price_amount_minor_int, poisha);
-- products carry title/slug/status/tags/brand/category/image for reads.
-- image_url points at public/ph/songoskriti/* final paths, never remote URLs.
insert into public.products
  (id, merchant_id, brand_id, category_id, title, slug, status, tags, description, search_doc, image_url, is_demo) values
  ('e50a0000-0000-4000-8000-000000002001','b50a0000-0000-4000-8000-000000000001','d50a0000-0000-4000-8000-000000001201','c50a0000-0000-4000-8000-000000001002','Rajshahi Silk Festive Panjabi','rajshahi-silk-festive-panjabi','active','{panjabi,silk,festive,mens}','Pure Rajshahi silk panjabi with subtle kantha stitch along the placket and mother-of-pearl buttons. Model is 182cm and wears size 40.','rajshahi silk panjabi festive kantha mens','/ph/songoskriti/prod-panjabi.png', true),
  ('e50a0000-0000-4000-8000-000000002002','b50a0000-0000-4000-8000-000000000001','d50a0000-0000-4000-8000-000000001202','c50a0000-0000-4000-8000-000000001001','Dhakai Jamdani Heritage Saree','dhakai-jamdani-heritage-saree','active','{jamdani,saree,silk,handloom}','Authentic Sonargaon Dhakai Jamdani with floral jall motifs in mulberry silk. Includes 80cm unstitched blouse piece. Model is 170cm.','dhakai jamdani saree silk handloom heritage','/ph/songoskriti/prod-saree.png', true),
  ('e50a0000-0000-4000-8000-000000002003','b50a0000-0000-4000-8000-000000000001','d50a0000-0000-4000-8000-000000001202','c50a0000-0000-4000-8000-000000001002','Comilla Handspun Khadi Kurta','comilla-khadi-casual-kurta','active','{khadi,kurta,cotton,handloom}','Authentic handspun Comilla khadi cotton with coconut-shell buttons. Breathable everyday cut. Model is 178cm and wears size 40.','comilla khadi kurta cotton handloom casual','/ph/songoskriti/prod-kurta.png', true),
  ('e50a0000-0000-4000-8000-000000002004','b50a0000-0000-4000-8000-000000000001','d50a0000-0000-4000-8000-000000001201','c50a0000-0000-4000-8000-000000001004','Jessore Nakshi Kantha Quilt','jessore-nakshi-kantha-quilt','active','{kantha,quilt,handloom,living}','Hand-stitched running-stitch kantha on layered natural cotton by Jessore craftswomen. Queen size, 88 x 96 in.','jessore nakshi kantha quilt handloom living','/ph/songoskriti/prod-kantha.png', true),
  ('e50a0000-0000-4000-8000-000000002005','b50a0000-0000-4000-8000-000000000001','d50a0000-0000-4000-8000-000000001201','c50a0000-0000-4000-8000-000000001005','Dhamrai Brass Heritage Necklace','dhamrai-brass-heritage-necklace','active','{jewellery,brass,necklace,artisan}','Hand-cut and engraved brass necklace with 22k antique gold plating by Dhamrai metalworkers.','dhamrai brass necklace jewellery artisan gold','/ph/songoskriti/prod-necklace.png', true),
  ('e50a0000-0000-4000-8000-000000002006','b50a0000-0000-4000-8000-000000000001','d50a0000-0000-4000-8000-000000001201','c50a0000-0000-4000-8000-000000001003','Girls Silk Festive Ghagra Choli Set','girls-silk-festive-ghagra-choli','active','{kids,silk,festive,ghagra}','Three-piece festive set in pure silk with a threadwork choli, flared ghagra skirt and contrast dupatta.','girls silk ghagra choli festive kids set', null, true)
on conflict (id) do update set title = excluded.title, slug = excluded.slug,
  status = excluded.status, tags = excluded.tags, description = excluded.description,
  search_doc = excluded.search_doc, image_url = excluded.image_url,
  is_demo = true, updated_at = now();

-- ---------------------------------------------------------------- variants ---
-- One row per demo variant. Money in integer minor units (BDT poisha).
insert into public.product_variants
  (id, merchant_id, product_id, name, sku, price_amount_minor_int, compare_at_amount_minor_int, currency_code, stock_quantity, position, is_demo) values
  ('f50a0000-0000-4000-8000-000000003001','b50a0000-0000-4000-8000-000000000001','e50a0000-0000-4000-8000-000000002001','Size 40 - Ivory','SNK-PNJ-40IV',495000,580000,'BDT',12,0, true),
  ('f50a0000-0000-4000-8000-000000003002','b50a0000-0000-4000-8000-000000000001','e50a0000-0000-4000-8000-000000002001','Size 42 - Ivory','SNK-PNJ-42IV',495000,580000,'BDT',9,1, true),
  ('f50a0000-0000-4000-8000-000000003003','b50a0000-0000-4000-8000-000000000001','e50a0000-0000-4000-8000-000000002001','Size 40 - Midnight Navy','SNK-PNJ-40NV',495000,null,'BDT',7,2, true),
  ('f50a0000-0000-4000-8000-000000003004','b50a0000-0000-4000-8000-000000000001','e50a0000-0000-4000-8000-000000002002','Emerald & Rose Gold','SNK-JAM-EMR',1850000,2200000,'BDT',5,0, true),
  ('f50a0000-0000-4000-8000-000000003005','b50a0000-0000-4000-8000-000000000001','e50a0000-0000-4000-8000-000000002002','Crimson & Gold','SNK-JAM-CRM',1850000,null,'BDT',4,1, true),
  ('f50a0000-0000-4000-8000-000000003006','b50a0000-0000-4000-8000-000000000001','e50a0000-0000-4000-8000-000000002003','Size M - Natural Off-White','SNK-KHD-MOL',285000,320000,'BDT',18,0, true),
  ('f50a0000-0000-4000-8000-000000003007','b50a0000-0000-4000-8000-000000000001','e50a0000-0000-4000-8000-000000002003','Size L - Natural Off-White','SNK-KHD-LOL',285000,320000,'BDT',14,1, true),
  ('f50a0000-0000-4000-8000-000000003008','b50a0000-0000-4000-8000-000000000001','e50a0000-0000-4000-8000-000000002004','Queen - Tree of Life','SNK-NKS-QTL',850000,980000,'BDT',8,0, true),
  ('f50a0000-0000-4000-8000-000000003009','b50a0000-0000-4000-8000-000000000001','e50a0000-0000-4000-8000-000000002005','Antique Gold','SNK-NKL-GLD',185000,220000,'BDT',20,0, true),
  ('f50a0000-0000-4000-8000-000000003010','b50a0000-0000-4000-8000-000000000001','e50a0000-0000-4000-8000-000000002006','Age 8-10 Yrs - Coral Rose','SNK-KID-08CR',450000,520000,'BDT',10,0, true)
on conflict (id) do update set name = excluded.name, sku = excluded.sku,
  price_amount_minor_int = excluded.price_amount_minor_int,
  compare_at_amount_minor_int = excluded.compare_at_amount_minor_int,
  currency_code = excluded.currency_code, stock_quantity = excluded.stock_quantity,
  position = excluded.position, is_demo = true, updated_at = now();

-- ------------------------------------------------------------- collections ---
-- new-in feeds homepage rail 1, bestsellers feeds rail 2 (see header note).
insert into public.collections (id, merchant_id, name, slug, description, image_url, is_demo) values
  ('a50a0000-0000-4000-8000-000000001001','b50a0000-0000-4000-8000-000000000001','New Arrivals','new-in','This season''s festive drop','/ph/songoskriti/cat-newin.png', true),
  ('a50a0000-0000-4000-8000-000000001002','b50a0000-0000-4000-8000-000000000001','Bestsellers','bestsellers','Most loved handloom staples', null, true),
  ('a50a0000-0000-4000-8000-000000001003','b50a0000-0000-4000-8000-000000000001','Eid & Festive','festive','Celebration dressing in handwoven silk and cotton','/ph/songoskriti/hero-festive.png', true),
  ('a50a0000-0000-4000-8000-000000001004','b50a0000-0000-4000-8000-000000000001','Wedding','wedding','Bridal sarees, groom panjabis and gifting','/ph/songoskriti/hero-weaves.png', true),
  ('a50a0000-0000-4000-8000-000000001005','b50a0000-0000-4000-8000-000000000001','Gifting','gifting','Kantha, brass and keepsakes to gift','/ph/songoskriti/hero-artisans.png', true)
on conflict (id) do update set name = excluded.name, slug = excluded.slug,
  description = excluded.description, image_url = excluded.image_url,
  is_demo = true, updated_at = now();

-- ----------------------------------------------- collection memberships -----
insert into public.collection_products (id, merchant_id, collection_id, product_id, position) values
  ('050a0000-0000-4000-8000-000000004001','b50a0000-0000-4000-8000-000000000001','a50a0000-0000-4000-8000-000000001001','e50a0000-0000-4000-8000-000000002001',0),
  ('050a0000-0000-4000-8000-000000004002','b50a0000-0000-4000-8000-000000000001','a50a0000-0000-4000-8000-000000001001','e50a0000-0000-4000-8000-000000002002',10),
  ('050a0000-0000-4000-8000-000000004003','b50a0000-0000-4000-8000-000000000001','a50a0000-0000-4000-8000-000000001001','e50a0000-0000-4000-8000-000000002006',20),
  ('050a0000-0000-4000-8000-000000004004','b50a0000-0000-4000-8000-000000000001','a50a0000-0000-4000-8000-000000001002','e50a0000-0000-4000-8000-000000002003',0),
  ('050a0000-0000-4000-8000-000000004005','b50a0000-0000-4000-8000-000000000001','a50a0000-0000-4000-8000-000000001002','e50a0000-0000-4000-8000-000000002004',10),
  ('050a0000-0000-4000-8000-000000004006','b50a0000-0000-4000-8000-000000000001','a50a0000-0000-4000-8000-000000001003','e50a0000-0000-4000-8000-000000002001',0),
  ('050a0000-0000-4000-8000-000000004007','b50a0000-0000-4000-8000-000000000001','a50a0000-0000-4000-8000-000000001003','e50a0000-0000-4000-8000-000000002002',10),
  ('050a0000-0000-4000-8000-000000004008','b50a0000-0000-4000-8000-000000000001','a50a0000-0000-4000-8000-000000001003','e50a0000-0000-4000-8000-000000002005',20),
  ('050a0000-0000-4000-8000-000000004009','b50a0000-0000-4000-8000-000000000001','a50a0000-0000-4000-8000-000000001003','e50a0000-0000-4000-8000-000000002006',30),
  ('050a0000-0000-4000-8000-000000004010','b50a0000-0000-4000-8000-000000000001','a50a0000-0000-4000-8000-000000001004','e50a0000-0000-4000-8000-000000002001',0),
  ('050a0000-0000-4000-8000-000000004011','b50a0000-0000-4000-8000-000000000001','a50a0000-0000-4000-8000-000000001004','e50a0000-0000-4000-8000-000000002002',10),
  ('050a0000-0000-4000-8000-000000004012','b50a0000-0000-4000-8000-000000000001','a50a0000-0000-4000-8000-000000001004','e50a0000-0000-4000-8000-000000002005',20),
  ('050a0000-0000-4000-8000-000000004013','b50a0000-0000-4000-8000-000000000001','a50a0000-0000-4000-8000-000000001005','e50a0000-0000-4000-8000-000000002004',0),
  ('050a0000-0000-4000-8000-000000004014','b50a0000-0000-4000-8000-000000000001','a50a0000-0000-4000-8000-000000001005','e50a0000-0000-4000-8000-000000002005',10),
  ('050a0000-0000-4000-8000-000000004015','b50a0000-0000-4000-8000-000000000001','a50a0000-0000-4000-8000-000000001005','e50a0000-0000-4000-8000-000000002006',20)
on conflict do nothing;
