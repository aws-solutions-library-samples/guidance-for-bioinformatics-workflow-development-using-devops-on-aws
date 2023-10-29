params.outdir = 'results'

process MULTIQC {
    container 'quay.io/nextflow/rnaseq-nf:v1.1'
    publishDir params.outdir, mode:'copy'

    input:
    path('*') 
    path(config) 

    output:
    path('multiqc_report.html')

    script:
    """
    echo "Running multi qc"
    cp $config/* .
    echo "custom_logo: \$PWD/logo.png" >> multiqc_config.yaml
    multiqc . || ls -lr && sleep 60
    """
}
