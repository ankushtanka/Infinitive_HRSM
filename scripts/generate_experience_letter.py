import os
import sys
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.opc.constants import RELATIONSHIP_TYPE

def set_cell_margins(cell, top=0, bottom=0, left=0, right=0):
    """Set inner padding for a table cell in twips (dxa)."""
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for margin_name, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{margin_name}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def clear_table_borders(table):
    """Remove all borders from a table."""
    tblPr = table._tbl.tblPr
    tblBorders = parse_xml(
        r'<w:tblBorders %s>'
        r'  <w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
        r'  <w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
        r'  <w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
        r'  <w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
        r'  <w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
        r'  <w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>'
        r'</w:tblBorders>' % nsdecls('w')
    )
    tblPr.append(tblBorders)

def add_hyperlink(paragraph, text, url, color_rgb=(0, 102, 204), underline=True, font_name="Arial", font_size_pt=8):
    """Add a clickable hyperlink with blue underline to a paragraph."""
    part = paragraph.part
    r_id = part.relate_to(url, RELATIONSHIP_TYPE.HYPERLINK, is_external=True)

    hyperlink = parse_xml(
        f'<w:hyperlink {nsdecls("w")} r:id="{r_id}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>'
    )
    new_run = parse_xml(f'<w:r {nsdecls("w")}/>')
    rPr = parse_xml(f'<w:rPr {nsdecls("w")}/>')

    # Color
    color = parse_xml(f'<w:color {nsdecls("w")} w:val="{color_rgb[0]:02x}{color_rgb[1]:02x}{color_rgb[2]:02x}"/>')
    rPr.append(color)

    # Underline
    if underline:
        u = parse_xml(f'<w:u {nsdecls("w")} w:val="single"/>')
        rPr.append(u)

    # Font
    rFonts = parse_xml(f'<w:rFonts {nsdecls("w")} w:ascii="{font_name}" w:hAnsi="{font_name}" w:cs="{font_name}"/>')
    rPr.append(rFonts)

    # Size
    sz = parse_xml(f'<w:sz {nsdecls("w")} w:val="{int(font_size_pt * 2)}"/>')
    rPr.append(sz)

    new_run.append(rPr)
    t = parse_xml(f'<w:t {nsdecls("w")}>{text}</w:t>')
    new_run.append(t)
    hyperlink.append(new_run)
    paragraph._p.append(hyperlink)

def format_run(run, font_name, size_pt, bold=False, underline=False, color_rgb=(0, 0, 0), superscript=False):
    """Set font styling and explicit OpenXML font binding."""
    run.font.name = font_name
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.underline = underline
    run.font.color.rgb = RGBColor(*color_rgb)
    if superscript:
        run.font.superscript = True
    
    rPr = run._r.get_or_add_rPr()
    rFonts = parse_xml(f'<w:rFonts {nsdecls("w")} w:ascii="{font_name}" w:hAnsi="{font_name}" w:cs="{font_name}"/>')
    rPr.append(rFonts)
    return run

def generate_experience_letter(
    output_path="Experience_Cum_Relieving_Letter.docx",
    employee_name="Gauransh Jaroli",
    father_name="Naresh",
    designation="Software Developer Engineer",
    joining_date=("09", "th", "Feb 2026"),
    relieving_date=("09", "th", "July 2026"),
    letter_date="Jul 24,2026",
    gender="male",  # "male" or "female"
    signatory_name="Ankush Ranka",
    signatory_title="Founder & CEO",
    logo_path=None
):
    doc = Document()

    # 1. PAGE SETUP
    # A4, portrait, white background, no borders
    # Margins: 2 cm top and bottom, 2.5 cm left and right
    section = doc.sections[0]
    section.page_width = Inches(8.267)   # 21.0 cm (A4)
    section.page_height = Inches(11.692) # 29.7 cm (A4)
    section.top_margin = Inches(0.787)    # 2.0 cm
    section.bottom_margin = Inches(0.787) # 2.0 cm
    section.left_margin = Inches(0.984)   # 2.5 cm
    section.right_margin = Inches(0.984)  # 2.5 cm

    # Grammar resolution based on gender
    is_female = (gender.lower() == "female")
    title_salutation = "Ms." if is_female else "Mr."
    relation_prefix = "D/o" if is_female else "S/o"
    pronoun_subject = "She" if is_female else "He"
    pronoun_subject_lower = "she" if is_female else "he"
    pronoun_object = "her" if is_female else "him"
    pronoun_possessive = "her" if is_female else "his"
    pronoun_possessive_cap = "Her" if is_female else "His"

    # =========================================================================
    # HEADER (two columns, no table borders)
    # Left column: company logo (cloud icon with database symbol), with the text
    # "Infinitive Cloud" below it and tagline "Limitless Solution for Cloud and Web Hosting" (tagline in 7 pt).
    # Right column, left-aligned text, Arial:
    #   INFINITIVE CLOUD (Arial, 10 pt, bold, CAPS, centered over the block)
    #   Registered Office: Kankroli,Rajasthan,313324
    #   Office Address: Udaipur Rajasthan,313001
    #   Phone No: +91 8690393087
    #   Email: cloudinfinitive@gmail.com
    #   CIN No: U62020RJ2025PTC109151
    #   (Details in Arial 8 pt. Labels in bold. Values normal. Email blue & underlined.)
    # =========================================================================
    header_table = doc.add_table(rows=1, cols=2)
    header_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    clear_table_borders(header_table)

    col_width_left = Inches(3.15)
    col_width_right = Inches(3.15)
    header_table.columns[0].width = col_width_left
    header_table.columns[1].width = col_width_right

    cell_left = header_table.cell(0, 0)
    cell_right = header_table.cell(0, 1)
    cell_left.width = col_width_left
    cell_right.width = col_width_right

    cell_left.vertical_alignment = WD_ALIGN_VERTICAL.TOP
    cell_right.vertical_alignment = WD_ALIGN_VERTICAL.TOP

    # Set cell margins (in twips: 1 inch = 1440 twips)
    set_cell_margins(cell_left, top=0, bottom=0, left=0, right=72)
    set_cell_margins(cell_right, top=0, bottom=0, left=72, right=0)

    # --- Left Column: Logo + Text + Tagline ---
    p_logo = cell_left.paragraphs[0]
    p_logo.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p_logo.paragraph_format.space_before = Pt(0)
    p_logo.paragraph_format.space_after = Pt(2)
    p_logo.paragraph_format.line_spacing = 1.0

    # Resolve logo image
    found_logo = False
    candidates = [
        logo_path,
        "public/infinitive_cloud_logo.png",
        os.path.join(os.path.dirname(__file__), "..", "public", "infinitive_cloud_logo.png")
    ]
    for c in candidates:
        if c and os.path.exists(c):
            p_logo.add_run().add_picture(c, width=Inches(2.35))
            found_logo = True
            break

    if not found_logo:
        # Placeholder if image is not provided
        r_ph = p_logo.add_run("[Company Logo: Cloud icon with database symbol]\n")
        format_run(r_ph, "Arial", 9, bold=True)

    # Text "Infinitive Cloud" below logo
    p_logo_text = cell_left.add_paragraph()
    p_logo_text.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p_logo_text.paragraph_format.space_before = Pt(1)
    p_logo_text.paragraph_format.space_after = Pt(1)
    p_logo_text.paragraph_format.line_spacing = 1.0
    r_lt = p_logo_text.add_run("Infinitive Cloud")
    format_run(r_lt, "Arial", 9.5, bold=True)

    # Tagline in 7 pt
    p_tagline = cell_left.add_paragraph()
    p_tagline.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p_tagline.paragraph_format.space_before = Pt(0)
    p_tagline.paragraph_format.space_after = Pt(0)
    p_tagline.paragraph_format.line_spacing = 1.0
    r_tag = p_tagline.add_run("Limitless Solution for Cloud and Web Hosting")
    format_run(r_tag, "Arial", 7, bold=False, color_rgb=(0x55, 0x55, 0x55))

    # --- Right Column: Company Registered Details ---
    # Line 1: INFINITIVE CLOUD (Arial, 10 pt, bold, CAPS, centered over the block)
    p_comp = cell_right.paragraphs[0]
    p_comp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_comp.paragraph_format.space_before = Pt(0)
    p_comp.paragraph_format.space_after = Pt(3)
    p_comp.paragraph_format.line_spacing = 1.0

    r_comp = p_comp.add_run("INFINITIVE CLOUD")
    format_run(r_comp, "Arial", 10, bold=True)

    # Details rows (Arial 8 pt, left-aligned, labels bold, values normal)
    details = [
        ("Registered Office:", " Kankroli,Rajasthan,313324"),
        ("Office Address:", " Udaipur Rajasthan,313001"),
        ("Phone No:", " +91 8690393087"),
        ("Email:", "email_special"),
        ("CIN No:", " U62020RJ2025PTC109151"),
    ]

    for label, val in details:
        p_det = cell_right.add_paragraph()
        p_det.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p_det.paragraph_format.space_before = Pt(0)
        p_det.paragraph_format.space_after = Pt(1.5)
        p_det.paragraph_format.line_spacing = 1.0

        r_lbl = p_det.add_run(label)
        format_run(r_lbl, "Arial", 8, bold=True)

        if val == "email_special":
            p_det.add_run(" ")
            add_hyperlink(
                p_det,
                text="cloudinfinitive@gmail.com",
                url="mailto:cloudinfinitive@gmail.com",
                color_rgb=(0, 102, 204),
                underline=True,
                font_name="Arial",
                font_size_pt=8
            )
        else:
            r_val = p_det.add_run(val)
            format_run(r_val, "Arial", 8, bold=False)

    # =========================================================================
    # TITLE SECTION
    # - Leave 3 blank lines after the header
    # - Line 1: EXPERIENCE CUM RELIEVING LETTER
    # - One blank line
    # - Line 2: TO WHOM SO EVER IT MAY CONCERN
    # - Both lines: Arial, 13 pt, Bold, Underlined, ALL CAPS, centered
    # =========================================================================
    for _ in range(3):
        p_b = doc.add_paragraph()
        p_b.paragraph_format.space_before = Pt(0)
        p_b.paragraph_format.space_after = Pt(0)
        p_b.paragraph_format.line_spacing = 1.0
        r = p_b.add_run("")
        format_run(r, "Arial", 11)

    p_title1 = doc.add_paragraph()
    p_title1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title1.paragraph_format.space_before = Pt(0)
    p_title1.paragraph_format.space_after = Pt(0)
    p_title1.paragraph_format.line_spacing = 1.0
    r_t1 = p_title1.add_run("EXPERIENCE CUM RELIEVING LETTER")
    format_run(r_t1, "Arial", 14, bold=True, underline=True)

    # One blank line
    p_b_mid = doc.add_paragraph()
    p_b_mid.paragraph_format.space_before = Pt(0)
    p_b_mid.paragraph_format.space_after = Pt(0)
    p_b_mid.paragraph_format.line_spacing = 1.0
    r_bm = p_b_mid.add_run("")
    format_run(r_bm, "Arial", 11)

    p_title2 = doc.add_paragraph()
    p_title2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title2.paragraph_format.space_before = Pt(0)
    p_title2.paragraph_format.space_after = Pt(14)
    p_title2.paragraph_format.line_spacing = 1.0
    r_t2 = p_title2.add_run("TO WHOM SO EVER IT MAY CONCERN")
    format_run(r_t2, "Arial", 14, bold=True, underline=True)

    # =========================================================================
    # BODY
    # Font: Arial, 11 pt, black, left-aligned, line spacing 1.15, 12 pt space after each paragraph
    # =========================================================================

    # --- Para 1 ---
    p1 = doc.add_paragraph()
    p1.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p1.paragraph_format.space_before = Pt(0)
    p1.paragraph_format.space_after = Pt(12)
    p1.paragraph_format.line_spacing = 1.15

    r1_1 = p1.add_run("This is to certify that ")
    format_run(r1_1, "Arial", 11, bold=False)

    r1_2 = p1.add_run(f"{title_salutation} {employee_name}")
    format_run(r1_2, "Arial", 11, bold=True)

    r1_3 = p1.add_run(f" {relation_prefix} Mr. {father_name} had been part of Infinitive Cloud team as a ")
    format_run(r1_3, "Arial", 11, bold=False)

    r1_4 = p1.add_run(designation)
    format_run(r1_4, "Arial", 11, bold=True)

    r1_5 = p1.add_run(" from ")
    format_run(r1_5, "Arial", 11, bold=False)

    # Date range in bold with superscript
    j_day, j_ord, j_rest = joining_date
    r1_6a = p1.add_run(j_day)
    format_run(r1_6a, "Arial", 11, bold=True)

    r1_6b = p1.add_run(j_ord)
    format_run(r1_6b, "Arial", 11, bold=True, superscript=True)

    r1_6c = p1.add_run(f" {j_rest} to ")
    format_run(r1_6c, "Arial", 11, bold=True)

    r_day, r_ord, r_rest = relieving_date
    r1_7a = p1.add_run(r_day)
    format_run(r1_7a, "Arial", 11, bold=True)

    r1_7b = p1.add_run(r_ord)
    format_run(r1_7b, "Arial", 11, bold=True, superscript=True)

    r1_7c = p1.add_run(f" {r_rest}.")
    format_run(r1_7c, "Arial", 11, bold=True)

    # --- Para 2 ---
    p2 = doc.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p2.paragraph_format.space_before = Pt(0)
    p2.paragraph_format.space_after = Pt(12)
    p2.paragraph_format.line_spacing = 1.15

    para2_text = (
        f"During {pronoun_possessive} tenure, {pronoun_subject_lower} was dedicated and committed to "
        f"{pronoun_possessive} work. All the task assigned to {pronoun_object} were accomplished to the "
        f"satisfaction. {pronoun_subject} was an excellent team member."
    )
    r2 = p2.add_run(para2_text)
    format_run(r2, "Arial", 11, bold=False)

    # --- Para 3 ---
    p3 = doc.add_paragraph()
    p3.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p3.paragraph_format.space_before = Pt(0)
    p3.paragraph_format.space_after = Pt(12)
    p3.paragraph_format.line_spacing = 1.15

    r3_1 = p3.add_run(f"{pronoun_possessive_cap} date of relieving from Infinitive Cloud  is ")
    format_run(r3_1, "Arial", 11, bold=False)

    r3_2a = p3.add_run(r_day)
    format_run(r3_2a, "Arial", 11, bold=True)

    r3_2b = p3.add_run(r_ord)
    format_run(r3_2b, "Arial", 11, bold=True, superscript=True)

    r3_2c = p3.add_run(f" {r_rest}.")
    format_run(r3_2c, "Arial", 11, bold=True)

    # --- Para 4 ---
    p4 = doc.add_paragraph()
    p4.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p4.paragraph_format.space_before = Pt(0)
    p4.paragraph_format.space_after = Pt(12)
    p4.paragraph_format.line_spacing = 1.15

    para4_text = (
        f"We wish {pronoun_object} success for all {pronoun_possessive} future endeavor and bright career ahead."
    )
    r4 = p4.add_run(para4_text)
    format_run(r4, "Arial", 11, bold=False)

    # =========================================================================
    # SIGNATURE BLOCK (Left aligned, Arial)
    # - Leave 2 blank lines after Para 4
    # - "For Infinitive Cloud" (11 pt, bold)
    # - Leave 3 blank lines for signature and company stamp
    # - Ankush Ranka (11 pt, normal)
    # - Founder & CEO (11 pt, normal)
    # - [Letter Date, e.g. Jul 24,2026] (11 pt, normal)
    # =========================================================================
    for _ in range(2):
        p_bs = doc.add_paragraph()
        p_bs.paragraph_format.space_before = Pt(0)
        p_bs.paragraph_format.space_after = Pt(0)
        p_bs.paragraph_format.line_spacing = 1.0
        r_bs = p_bs.add_run("")
        format_run(r_bs, "Arial", 11)

    p_for = doc.add_paragraph()
    p_for.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p_for.paragraph_format.space_before = Pt(0)
    p_for.paragraph_format.space_after = Pt(0)
    p_for.paragraph_format.line_spacing = 1.0

    r_for = p_for.add_run("For Infinitive Cloud")
    format_run(r_for, "Arial", 11, bold=True)

    for _ in range(3):
        p_bstamp = doc.add_paragraph()
        p_bstamp.paragraph_format.space_before = Pt(0)
        p_bstamp.paragraph_format.space_after = Pt(0)
        p_bstamp.paragraph_format.line_spacing = 1.0
        r_bstamp = p_bstamp.add_run("")
        format_run(r_bstamp, "Arial", 11)

    # Signatory details
    sig_lines = [
        signatory_name,
        signatory_title,
        letter_date,
    ]
    for idx, s_line in enumerate(sig_lines):
        p_s = doc.add_paragraph()
        p_s.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p_s.paragraph_format.space_before = Pt(0)
        p_s.paragraph_format.space_after = Pt(1.5)
        p_s.paragraph_format.line_spacing = 1.15

        r_s = p_s.add_run(s_line)
        format_run(r_s, "Arial", 11, bold=False)
  
    # Save to destination
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    doc.save(output_path)
    print(f"Generated: {output_path}")
    return output_path

if __name__ == "__main__":
    out1 = "Experience_Cum_Relieving_Letter.docx"
    generate_experience_letter(out1)
    
    out2 = os.path.join("public", "downloads", "Experience_Cum_Relieving_Letter.docx")
    generate_experience_letter(out2)

